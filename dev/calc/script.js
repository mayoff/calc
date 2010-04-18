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
};

Calc = {

	 parse: function(input) {
	
		function beget(base, properties) {
			function constructor() {}
			constructor.prototype = base;
			return extend(new constructor(), properties);
		}
		
		function extend(object, properties) {
			for (key in properties) {
				object[key] = properties[key];
			}
			return object;
		}
	
		///////////////////////////////////////////////////////////////////////////
		// Lexical analysis
	
		var length = input.length,
			offset = 0,
			token;
	
		function consume() {
			var consumed = token;
			token = lex();
			return consumed;
		};
		
		var tokenTypes = {};
	
		var primitiveType = {
			parseAsPrefix: function() { throw 'Cannot use ' + this.name + ' as a prefix/standalone.'; },
			parseAsSuffix: function() { throw 'Cannot use ' + this.name + ' as a suffix.'; },
		};
		
		function nodeToString(node) {
			if (node === null) {
				return 'null';
			} else if (node === undefined) {
				return 'undefined';
			} else {
				return node.toString();
			}
		}
		
		function simpleType(name, precedence, extensions) {
			precedence = precedence || 0;
			var type = tokenTypes[name];
			if (type) {
				type.precedence = Math.max(type.precedence, precedence);
			} else {
				type = tokenTypes[name] = beget(primitiveType, {
					name: name,
					precedence: precedence,
					toString: function() { return this.name; },
					finalNode: function() { return this; },
				});
			}
			extend(type, extensions);
			return type;
		}
		
		function infixType(name, precedence, extensions) {
			var type = simpleType(name, precedence, {
				finalNode: function() { return this.rhs.finalNode(); },
				parseAsSuffix: function(lhs) {
					return extend(this, {
						lhs: lhs,
						rhs: expression(this.isRightAssociative ? this.precedence - 1 : this.precedence),
					});
				},
				toString: function() {
					return '[' + nodeToString(this.lhs) + ' ' + this.name + ' ' + nodeToString(this.rhs) + ']';
				},
				pushUserHtml: function(array) {
					this.lhs.pushUserHtml(array);
					array.push(' ', this.userHtml || this.name, ' ');
					this.rhs.pushUserHtml(array);
				},
				permissibleFollowers: function() { return this.rhs.permissibleFollowers(); },
			});
			return extend(type, extensions);
		}
		
		function prefixType(name, precedence, extensions) {
			var type = simpleType(name, undefined, {
				finalNode: function() { return this.rhs.finalNode(); },
				parseAsPrefix: function() {
					this.isUnary = true;
					this.rhs = expression(precedence);
					return this;
				},
				toString: function() {
					return '[' + this.name + ' ' + nodeToString(this.rhs) + ']';
				},
				pushUserHtml: function(array) {
					array.push(this.userHtml || this.name, ' ');
					this.rhs.pushUserHtml(array);
				},
				permissibleFollowers: function() { return this.rhs.permissibleFollowers(); },
			});
			return extend(type, extensions);
		}
		
		endIndicatorHtml = '<span class="endIndicator">&#x2038;</span>';
	
		END = '(end)';
		simpleType(END, -1, {
			parseAsPrefix: function() { return this; },
			pushUserHtml: function(array) { array.push(endIndicatorHtml); },
			permissibleFollowers: function() {
				return FollowerTypes.Prefix | FollowerTypes.Digit | FollowerTypes.Point;
			},
			value: function(defaultValue) { return defaultValue; },
		});
		
		NUMBER = '(number)';
		simpleType(NUMBER, undefined, {
			toString: function() { return this.text; },
			pushUserHtml: function(array) { array.push(this.text); },
			parseAsPrefix: function() { return this; },
			permissibleFollowers: function() {
				return (FollowerTypes.Suffix | FollowerTypes.Digit |
					(this.text.indexOf('.') == -1 ? FollowerTypes.Point : 0));
			},
			value: function() { return Number(this.text); },
		});
		
		// POINT is used when input[length-1] === '.' and index[length-2] is not a digit.
		POINT = '(point)';
		simpleType(POINT, undefined, {
			parseAsPrefix: function() { return this; },
			pushUserHtml: function(array) { array.push('.', endIndicatorHtml); },
			permissibleFollowers: function() {
				return FollowerTypes.Digit;
			},
			value: function(defaultValue) { return defaultValue; },
		});
		
		simpleType(')');
	
		infixType('+', 50, { value: function() { return this.lhs.value() + this.rhs.value(0); }, });
		infixType('-', 50, { userHtml: '&minus;',
			value: function() {
				return (this.lhs ? this.lhs.value() : 0) - this.rhs.value(0);
			},
		});
		infixType('*', 60, { userHtml: '&times;', value: function() { return this.lhs.value() * this.rhs.value(1); }, });
		infixType('/', 60, { userHtml: '&divide;', value: function() { return this.lhs.value() / this.rhs.value(1); }, });
		prefixType('-', 80, {
			pushUserHtml: function(array) {
				if (!this.isUnary) {
					this.lhs.pushUserHtml(array);
					array.push(' ');
				}
				array.push(this.userHtml, ' ');
				this.rhs.pushUserHtml(array);
			},
		});
		infixType('^', 90, {
			isRightAssociative: true,
			pushUserHtml: function(array) {
				this.lhs.pushUserHtml(array);
				array.push('<sup>');
				this.rhs.pushUserHtml(array);
				array.push('</sup>');
			},
			value: function() { return Math.pow(this.lhs.value(), this.rhs.value(1)); },
		});

		simpleType('(', 100, {
			finalNode: function() {
				return this.isOpen ? this.rhs.finalNode() : this;
			},
			parseAsPrefix: function() {
				this.rhs = expression(0);
				if (token.name === END) { this.isOpen = true; }
				else if (token.name == ')') { consume(); }
				else { throw 'Missing right parenthesis.'; }
				return this;
			},
			toString: function() { return '(' + nodeToString(this.rhs) + (this.isOpen ? '?' : ')'); },
			pushUserHtml: function(array) {
				array.push('(');
				this.rhs.pushUserHtml(array);
				array.push(this.isOpen ? '<span class="hint">)</span>' : ')');
			},
			permissibleFollowers: function() {
				return this.isOpen ? this.rhs.permissibleFollowers() : FollowerTypes.Suffix;
			},
			value: function(defaultValue) { return this.rhs.value(defaultValue); },
		});
	
		numberRe = /[0-9]+(?:\.[0-9]*)?|\.[0-9]+/g;
	
		function lex() {
			var c;
			while (true) {
				if (offset >= length)
					return beget(tokenTypes[END]);
				c = input[offset];
				if (c !== ' ')
					break;
				++offset;
			}
			
			if (c in tokenTypes) {
				++offset;
				return beget(tokenTypes[c]);
			}
			
			if (c === '.' && offset === length - 1) {
				++offset;
				return beget(tokenTypes[POINT], { text: c });
			}
	
			if ('0123456789.'.indexOf(c) >= 0) {
				numberRe.lastIndex = offset;
				text = numberRe.exec(input)[0];
				offset = numberRe.lastIndex;
				return beget(tokenTypes[NUMBER], { text: text });
			}
			
			throw 'Invalid character "' + c + '" at offset ' + offset;
		}
	
		///////////////////////////////////////////////////////////////////////////
		// Syntatic analysis
	
        function expression(leftOpPrecedence) {
                var node = consume().parseAsPrefix();
                while (leftOpPrecedence < token.precedence) {
                        node = consume().parseAsSuffix(node);
                }
                return node;
        }
        
		///////////////////////////////////////////////////////////////////////////
	
		// Set token to the first token.
		consume();
		return expression(-1);
	},
	
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
			eq.node.pushUserHtml(fragments);
			value = eq.node.value();
			if (value != null) {
				fragments.push('<span class="result"><span class="equalSign">=</span>');
				this.pushHtmlForValue(fragments, value);
				fragments.push('</span><br clear="both" />');
			}
			eq.dom.innerHTML = fragments.join('');
			this.enableButtons();
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
		this.setCurrentText(this.currentEquation.text + s);
	},
	
	backspace: function() {
		this.setCurrentText(this.currentEquation.text.slice(0, -1));
	},
	
	appendParen: function() {
		this.setCurrentText(this.currentEquation.text + this.buttonParensLabel.innerHTML);
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
		'buttonExponent':  { action: function() { Calc.append('^'); }, followerTypes: FollowerTypes.Suffix, },
		'buttonEnter': { action: function() { Calc.startNewEquation(); }, },
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
		this.controlsMask.style.visibility = (window.isAtBottom() && !this.suppressTouch) ? 'hidden' : 'visible';
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

		if (e.type != 'touchend' && e.type != 'click')
			return false;
			
		var x, y;
		if (e.type == 'touchend') {
			var touch = e.type == 'touchend' ? e.changedTouches[0] : e.touches[0];
			x = touch.pageX;
			y = touch.pageY;
		}
		else {
			x = e.pageX;
			y = e.pageY;
		}

		var button = this.buttonAtPagePoint(x, y);
		if (button && button.isEnabled)
			this.buttonWasClicked(button);
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
		button.isEnabled = isEnabled;
		button.style.opacity = isEnabled ? 1 : .5;
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
				else if (pf & FollowerTypes.Suffix) {
					this.setButtonEnabled(button, true);
					this.buttonParensLabel.innerHTML = ')';
				}
				else this.setButtonEnabled(button, false);
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
		return true;
	},
	
};

window.addEventListener('load', function() { Calc.onLoad(); }, false);
