Node.prototype.isDescendentOf = function(target) {
	var node = this;
	while (true) {
		if (!node) return false;
		if (node == target) return true;
		node = node.parentNode;
	}
};

window.isAtBottom = function() { 
	return window.innerHeight + window.scrollY === document.height;
};

function nothing() { }

FollowerTypes = {
	Prefix: 0x1,
	Suffix: 0x2,
	Digit: 0x4,
	Point: 0x8,
	CloseParenthesis: 0x10
};

Calc = {

	 parse: (function() {
	
		// These change on every call to parse.
		var input, length, offset, token;
		
		// These are static.
		var tokenPrototypes = {},
			primitivePrototype = {
				prefixParse: function() { throw 'Cannot use ' + this.name + ' as a prefix/standalone.'; },
				suffixParse: function() { throw 'Cannot use ' + this.name + ' as a suffix.'; },
				value: function(defaultValue) { return defaultValue; }
			},
			endIndicatorHtml = '<span class="endIndicator">&#x2038;</span>',
			END = '(end)',
			NUMBER = '(number)',
			POINT = '(point)',
			numberRe = /[0-9]+(?:\.[0-9]*)?|\.[0-9]+/g;

		// Syntatic analysis.	 More syntatic analysis is found in the prefixParse and suffixParse methods of the parse tree node prototypes.

		function _parse(s) {
			input = s;
			length = s.length;
			offset = 0;
			consume(); // This initializes token.
			var node = expression(0);
			if (token.name != END) {
				throw 'Extra stuff after expression';
			}
			input = token = null;
			return node;
		}
	
		function expression(leftOpPrecedence) {
				for (var node = consume().prefixParse(); leftOpPrecedence < token.precedence; ) {
						node = consume().suffixParse(node);
				}
				return node;
		}

		// Helper functions.
		
		function beget(base, properties) {
			function Constructor() {}
			Constructor.prototype = base;
			return extend(new Constructor(), properties);
		}
		
		function extend(object, properties) {
			for (key in properties) {
				object[key] = properties[key];
			}
			return object;
		}

		// Parse tree node prototypes.

		function simple(name, precedence, extensions) {
			precedence = precedence || 0;
			var type = tokenPrototypes[name];
			if (type) {
				type.precedence = Math.max(type.precedence, precedence);
			} else {
				type = tokenPrototypes[name] = beget(primitivePrototype, {
					name: name,
					precedence: precedence
				});
			}
			extend(type, extensions);
			return type;
		}

		function prefix(name, precedence, extensions) {
			var type = simple(name, undefined, {
				prefixParse: function() {
					this.isUnary = true;
					this.rhs = expression(precedence);
					return this;
				},
				pushHtml: function(array) {
					array.push(this.html || this.name, ' ');
					this.rhs.pushHtml(array);
				},
				permissibleFollowers: function() { return this.rhs.permissibleFollowers(); }
			});
			return extend(type, extensions);
		}

		function infix(name, precedence, extensions) {
			var type = simple(name, precedence, {
				suffixParse: function(lhs) {
					return extend(this, {
						lhs: lhs,
						rhs: expression(this.isRightAssociative ? this.precedence - 1 : this.precedence)
					});
				},
				pushHtml: function(array) {
					this.lhs.pushHtml(array);
					array.push(' ', this.html || this.name, ' ');
					this.rhs.pushHtml(array);
				},
				permissibleFollowers: function() { return this.rhs.permissibleFollowers(); }
			});
			return extend(type, extensions);
		}
		
		simple(END, 0, {
			prefixParse: function() { return this; },
			pushHtml: function(array) { array.push(endIndicatorHtml); },
			permissibleFollowers: function() {
				return FollowerTypes.Prefix | FollowerTypes.Digit | FollowerTypes.Point;
			}
		});
		
		simple(NUMBER, undefined, {
			prefixParse: function() { return this; },
			value: function() { return Number(this.text); },
			pushHtml: function(array) { array.push(this.text); },
			permissibleFollowers: function() {
				return (FollowerTypes.Suffix | FollowerTypes.Digit |
					(this.text.indexOf('.') == -1 ? FollowerTypes.Point : 0));
			}
		});
		
		// POINT is used when input[length-1] === '.' and index[length-2] is not a digit.
		simple(POINT, undefined, {
			prefixParse: function() { return this; },
			value: function(defaultValue) { return defaultValue; },
			pushHtml: function(array) { array.push('.', endIndicatorHtml); },
			permissibleFollowers: function() { return FollowerTypes.Digit; }
		});
		
		infix('+', 50, { value: function() { return this.lhs.value() + this.rhs.value(0); } });
		infix('-', 50);
		infix('*', 60, { html: '&times;', value: function() { return this.lhs.value() * this.rhs.value(1); } });
		infix('/', 60, { html: '&divide;', value: function() { return this.lhs.value() / this.rhs.value(1); } });
		prefix('-', 80, {
			value: function() { return (this.lhs ? this.lhs.value() : 0) - this.rhs.value(0); },
			pushHtml: function(array) {
				if (!this.isUnary) {
					this.lhs.pushHtml(array);
					array.push(' ');
				}
				array.push('&minus; ');
				this.rhs.pushHtml(array);
			}
		});
		infix('^', 90, {
			isRightAssociative: true,
			value: function() { return Math.pow(this.lhs.value(), this.rhs.value(1)); },
			pushHtml: function(array) {
				this.lhs.pushHtml(array);
				array.push('<sup>');
				this.rhs.pushHtml(array);
				array.push('</sup>');
			}
		});

		simple('(', 100, {
			prefixParse: function() {
				this.rhs = expression(0);
				if (token.name === END) { this.isOpen = true; }
				else if (token.name == ')') { consume(); }
				else { throw 'Missing right parenthesis.'; }
				return this;
			},
			value: function(defaultValue) { return this.rhs.value(defaultValue); },
			pushHtml: function(array) {
				array.push('(');
				this.rhs.pushHtml(array);
				array.push(this.isOpen ? '<span class="hint">)</span>' : ')');
			},
			permissibleFollowers: function() {
				if (this.isOpen) {
					var pf = this.rhs.permissibleFollowers();
					return pf | ((pf & FollowerTypes.Suffix) ? FollowerTypes.CloseParenthesis : 0);
				} else {
					return FollowerTypes.Suffix;
				}
			}
		});
		simple(')');
	
		// Lexical analysis.	
	
		function consume() {
			var consumed = token;
			token = lex();
			return consumed;
		}

		function lex() {
			var c;
			while (true) {
				if (offset >= length)
					return beget(tokenPrototypes[END]);
				c = input[offset];
				if (c !== ' ')
					break;
				++offset;
			}
			
			if (c in tokenPrototypes) {
				++offset;
				return beget(tokenPrototypes[c]);
			}
			
			if (c === '.' && offset === length - 1) {
				++offset;
				return beget(tokenPrototypes[POINT], { text: c });
			}
	
			if ('0123456789.'.indexOf(c) >= 0) {
				numberRe.lastIndex = offset;
				var text = numberRe.exec(input)[0];
				offset = numberRe.lastIndex;
				return beget(tokenPrototypes[NUMBER], { text: text });
			}
			
			throw 'Invalid character "' + c + '" at offset ' + offset;
		}

		return _parse;	
	})(),

	transcriptDom: document.getElementById('transcript'),
	buttons: Array.prototype.map.call(document.getElementsByClassName('button'), function(e) { return e; }),
	controlsDiv: document.getElementById('controls'),
	controlsMask: document.getElementById('controlsMask'),
	buttonParensLabel: document.getElementById('buttonParensLabel'),

	// The current equation.
	currentEquation: {
		// The text entered for the equation.
		text: null,
		// The parse tree of the equation.
		node: null,
		// The DOM node displaying the equation.
		dom: null,
	},
	
	pushHtmlForValue: function(fragments, value) {
		if (value === Number.NEGATIVE_INFINITY) {
			fragments.push('-&#x221e');
		} else if (value === Number.POSITIVE_INFINITY) {
			fragments.push('&#x221e');
		} else if (isNaN(value)) {
			fragments.push('undefined');
		} else{
			fragments.push(value);
		}
	},

	setCurrentText: function(text) {
		var eq = this.currentEquation, newNode, fragments, value;
		try {
			newNode = this.parse(text);
			eq.text = text;
			eq.node = newNode;
			fragments = [];
			eq.node.pushHtml(fragments);
			value = eq.node.value();
			if (value != null) {
				fragments.push('<span class="result"><span class="equalSign">=</span>');
				this.pushHtmlForValue(fragments, value);
				fragments.push('</span><br clear="both" />');
			}
			eq.dom.innerHTML = fragments.join('');
		} catch (e) { }
	},

	startNewEquation: function() {
		var eq = this.currentEquation;
		if (eq.dom)
			$(eq.dom).removeClass('current');
		eq.dom = document.createElement('div');
		eq.dom.className = 'equation current';
		this.transcriptDom.appendChild(eq.dom);		
		this.setCurrentText('');
	},
	
	append: function(s) {
		this.setCurrentText(this.pretouchText + s);
	},
	
	backspace: function() {
		this.setCurrentText(this.pretouchText.slice(0, -1));
	},
	
	appendParen: function() {
		this.setCurrentText(this.pretouchText + this.buttonParensLabel.innerHTML);
	},

	buttonTraits: {
		'button0': { action: function() { Calc.append('0'); }, followerTypes: FollowerTypes.Digit, },
		'button1': { action: function() { Calc.append('1'); }, followerTypes: FollowerTypes.Digit, },
		'button2': { action: function() { Calc.append('2'); }, followerTypes: FollowerTypes.Digit, },
		'button3': { action: function() { Calc.append('3'); }, followerTypes: FollowerTypes.Digit, },
		'button4': { action: function() { Calc.append('4'); }, followerTypes: FollowerTypes.Digit, },
		'button5': { action: function() { Calc.append('5'); }, followerTypes: FollowerTypes.Digit, },
		'button6': { action: function() { Calc.append('6'); }, followerTypes: FollowerTypes.Digit, },
		'button7': { action: function() { Calc.append('7'); }, followerTypes: FollowerTypes.Digit, },
		'button8': { action: function() { Calc.append('8'); }, followerTypes: FollowerTypes.Digit, },
		'button9': { action: function() { Calc.append('9'); }, followerTypes: FollowerTypes.Digit, },
		'buttonPoint': { action: function() { Calc.append('.'); }, followerTypes: FollowerTypes.Point, },
		'buttonPlus': { action: function() { Calc.append('+'); }, followerTypes: FollowerTypes.Suffix, },
		'buttonMinus': { action: function() { Calc.append('-'); }, followerTypes: FollowerTypes.Prefix | FollowerTypes.Suffix, },
		'buttonTimes': { action: function() { Calc.append('*'); }, followerTypes: FollowerTypes.Suffix, },
		'buttonDivide': { action: function() { Calc.append('/'); }, followerTypes: FollowerTypes.Suffix, },
		'buttonParens': { action: function() { Calc.appendParen(); }, },
		'buttonBackspace': { action: function() { Calc.backspace(); }, followerTypes: ~0, },
		'buttonExponent': { action: function() { Calc.append('^'); }, followerTypes: FollowerTypes.Suffix, },
		'buttonEnter': { action: function() { Calc.startNewEquation(); }, },
		'buttonFunction': { action: function() { } }
	},

	buttonAtPagePoint: function(x, y) {
		var i, buttons = this.buttons, l = buttons.length, button, jq;
		for (i = 0; i < l; ++i) {
			button = buttons[i];
			jq = $(button);
			var offset = jq.offset();
			if (x < offset.left || x >= offset.left + jq.width() || y < offset.top || y >= offset.top + jq.height())
				continue;
			return button.isEnabled ? button : null;
		}
		return null;
	},
	
	suppressTouch: false,

	setControlsMaskVisibility: function() {
		this.controlsMask.style.opacity = (window.isAtBottom() && !this.suppressTouch) ? 0 : 1;
	},

	handleScrollEvent: function (e) {
		this.setControlsMaskVisibility();
		return true;
	},

	handleTranscriptEvent: function(e) {
		this.setControlsMaskVisibility();
		return true;
	},

	handleControlsEvent: function(e) {
		e.preventDefault(); // prevent scrolling
		e.stopPropagation();
		
		if (!window.isAtBottom()) {
			this.suppressTouch = true;
			this.scrollToBottom();
			return false;
		}
		
		if (this.suppressTouch) {
			if (e.type == 'touchend' || e.type == 'touchcancel')
				this.suppressTouch = false;
			this.setControlsMaskVisibility();
			return false;
		}

		var isFirstEvent = (e.type === 'touchstart' || e.type === 'click');
		var isFinalEvent = (e.type === 'touchend' || e.type === 'click');
		
		if (isFirstEvent) {
			this.pretouchText = this.currentEquation.text;
		}
		
		else if (e.type === 'touchcancel') {
			this.setCurrentText(this.pretouchText);
			this.enableButtons();
			this.scrollToBottom();
			return false;
		}

		var x, y;
		if (e.type === 'click') {
			x = e.pageX;
			y = e.pageY;
		}
		else {
			var touch = e.type === 'touchend' ? e.changedTouches[0] : e.touches[0];
			x = touch.pageX;
			y = touch.pageY;
		}

		var button = this.buttonAtPagePoint(x, y);
		if (button && button.isEnabled) {
			if (button.id !== 'buttonEnter' || isFinalEvent)
				this.buttonWasClicked(button);
		} else if (this.pretouchText !== this.currentEquation.text) {
			this.setCurrentText(this.pretouchText);
			this.scrollToBottom();
		}
		if (isFinalEvent)
			this.enableButtons();
		return false;
	},
	
	buttonWasClicked: function(button) {
		button.traits.action();
		this.scrollToBottom();
		return false;
	},

	initializeButtons: function() {
		this.buttons.forEach(function(button) { button.traits = this.buttonTraits[button.id]; }, this);
	
		var proxy = { handleEvent: function() { return Calc.handleControlsEvent.apply(Calc, arguments); } };
		this.controlsDiv.addEventListener('click', proxy, true); // for Safari debugging
		this.controlsDiv.addEventListener('touchstart', proxy, true);
		this.controlsDiv.addEventListener('touchmove', proxy, true);
		this.controlsDiv.addEventListener('touchend', proxy, true);
		this.controlsDiv.addEventListener('touchcancel', proxy, true);
		this.controlsDiv.addEventListener('selectstart', this, true);
		
		proxy = { handleEvent: function(e) { return Calc.handleTranscriptEvent.apply(Calc, arguments); } };
		this.transcriptDom.addEventListener('touchstart', proxy, false);
		this.transcriptDom.addEventListener('touchmove', proxy, false);
		this.transcriptDom.addEventListener('touchend', proxy, false);
		this.transcriptDom.addEventListener('touchcancel', proxy, false);
		this.transcriptDom.addEventListener('selectstart', proxy, false);
		this.transcriptDom.addEventListener('select', proxy, false);
		this.transcriptDom.addEventListener('gesturestart', proxy, false);
		this.transcriptDom.addEventListener('gesturechange', proxy, false);
		this.transcriptDom.addEventListener('gestureend', proxy, false);

		proxy = {
			handleEvent: function(e) {
				Calc.setControlsMaskVisibility();
				return true;
			},
		};
		document.addEventListener('scroll', proxy, true);
	},
	
	setButtonEnabled: function(button, isEnabled) {
		if (button.isEnabled !== isEnabled) {
			button.isEnabled = isEnabled;
			button.style.opacity = isEnabled ? 1 : .5;
		}
	},

	enableButtons: function() {
		var pf = this.currentEquation.node.permissibleFollowers();
		var buttons = this.buttons, l = buttons.length, button;
		for (var i = 0; i < l; ++i) {
			button = buttons[i];
			if (button.id == 'buttonEnter') {
				this.setButtonEnabled(button, this.currentEquation.text.length > 0);
			}
			
			else if (button.id == 'buttonParens') {
				if (pf & FollowerTypes.Prefix) {
					this.setButtonEnabled(button, true);
					this.buttonParensLabel.innerHTML = '(';
				}
				else if (pf & FollowerTypes.CloseParenthesis) {
					this.setButtonEnabled(button, true);
					this.buttonParensLabel.innerHTML = ')';
				}
				else {
					this.setButtonEnabled(button, false);
				}
			}
			
			else {
				this.setButtonEnabled(button, (button.traits.followerTypes & pf) !== 0);
			}
		}
	},

	_scrollToBottom: function() {
		document.body.offsetTop;
		document.body.scrollTop = document.body.scrollHeight;
		this.setControlsMaskVisibility();
	},

	scrollToBottom: function() {
		this._scrollToBottom();
		setTimeout('Calc._scrollToBottom()', 0);
	},
	
	onLoad: function() {
		this.initializeButtons();
		this.startNewEquation();
		this.scrollToBottom();
		this.enableButtons();
		return true;
	},
	
};

window.addEventListener('load', function() { Calc.onLoad(); }, false);
