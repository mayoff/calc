Element.prototype.containsPagePoint = function(x, y) {
	var me = $(this);
	var offset = me.offset(), width = me.width(), height = me.height();
	return (x >= offset.left && x < offset.left + width
		&& y >= offset.top && y < offset.top + height);
};

Node.prototype.isDescendentOf = function(target) {
	var node = this;
	while (true) {
		if (!node) return false;
		if (node == target) return true;
		node = node.parentNode;
	}
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
			});
			return extend(type, extensions);
		}
		
		endIndicatorHtml = '<span class="endIndicator">&#x2038;</span>';
	
		END = '(end)';
		simpleType(END, undefined, {
			parseAsPrefix: function() { return this; },
			pushUserHtml: function(array) { array.push(endIndicatorHtml); },
		});
		
		NUMBER = '(number)';
		simpleType(NUMBER, undefined, {
			toString: function() { return this.text; },
			pushUserHtml: function(array) { array.push(this.text); },
			parseAsPrefix: function() { return this; },
		});
		
		// POINT is used when input[length-1] === '.' and index[length-2] is not a digit.
		POINT = '(point)';
		simpleType(POINT, undefined, {
			parseAsPrefix: function() { return this; },
			pushUserHtml: function(array) { array.push('.', endIndicatorHtml); },
		});
		
		simpleType(')');
	
		infixType('+', 50);
		infixType('-', 50, { userHtml: '&minus;', });
		infixType('*', 60, { userHtml: '&times;', });
		infixType('/', 60, { userHtml: '&divide;', });
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
		return expression(0);
	},
	
	transcriptDom: document.getElementById('transcript'),
	buttons: document.getElementsByClassName('button'),
	controlsDiv: document.getElementById('controls'),

	// The current equation.
	currentEquation: {
		// The text entered for the equation.
		text: null,
		// The parse tree of the equation.
		node: null,
		// The DOM node displaying the equation.
		dom: null,
	},

	setCurrentText: function(text) {
		var eq = this.currentEquation, newNode, fragments;
		eq.text = text;
		eq.dom.innerHTML = text;
		return;
		try {
			newNode = this.parse(text);
			eq.text = text;
			eq.node = newNode;
			fragments = [];
			eq.node.pushUserHtml(fragments);
			eq.dom.innerHTML = fragments.join('');
			this.enableButtons();
		} catch (e) { }
	},

	startNewEquation: function() {
		var eq = this.currentEquation;
		eq.dom = document.createElement('div');
		eq.dom.className = 'equation';
		this.transcriptDom.appendChild(eq.dom);		
		this.setCurrentText('');
	},
	
	append: function(s) {
		this.setCurrentText(this.currentEquation.text + s);
	},
	
	backspace: function() {
		this.setCurrentText(this.currentEquation.text.slice(0, -1));
	},

	buttonActions: {
		'button0': function() { Calc.append('0'); },
		'button1': function() { Calc.append('1'); },
		'button2': function() { Calc.append('2'); },
		'button3': function() { Calc.append('3'); },
		'button4': function() { Calc.append('4'); },
		'button5': function() { Calc.append('5'); },
		'button6': function() { Calc.append('6'); },
		'button7': function() { Calc.append('7'); },
		'button8': function() { Calc.append('8'); },
		'button9': function() { Calc.append('9'); },
		'buttonPoint': function() { Calc.append('.'); },
		'buttonPlus': function() { Calc.append('+'); },
		'buttonMinus': function() { Calc.append('-'); },
		'buttonTimes': function() { Calc.append('*'); },
		'buttonDivide': function() { Calc.append('/'); },
		'buttonParens': function() { Calc.appendParen(); },
		'buttonBackspace': function() { Calc.backspace(); },
	},

	buttonAtPagePoint: function(x, y) {
		var i, buttons = this.buttons, l = buttons.length, button;
		for (i = 0; i < l; ++i) {
			button = buttons[i];
			if (button.isEnabled && button.containsPagePoint(x, y))
				return button;
		}
		return null;
	},
	
	suppressTouch: false,

	handleEvent: function(e) {
		if (!e.target.isDescendentOf(this.controlsDiv)) {
			return true;
		}

		e.preventDefault(); // prevent scrolling
		e.stopPropagation();
		
		if (window.innerHeight + window.scrollY != document.height) {
			this._scrollToBottom();
			this.suppressTouch = true;
			return false;
		}
		
		if (this.suppressTouch) {
			if (e.type == 'touchend' || e.type == 'touchcancel')
				this.suppressTouch = false;
			return false;
		}
		
		console.log(e.type);
		Calc.setCurrentText(e.type + ' ' + e.target);
		return false;
	},

	initializeButtons: function() {
		this.enableButtons();
		var buttons = this.buttons;
	
		function ignoreEvent(e) {
			e.preventDefault();
			e.stopPropagation();
			return false;
		}
	
		function ontouch(e) {
			e.preventDefault(); // stops drag-scrolling
			e.stopPropagation();
			if (!e.touches || !e.touches[0])
				return;
			var x = e.touches[0].pageX, y = e.touches[0].pageY;
			var button = Calc.buttonAtPagePoint(x, y);
			Calc.setCurrentText(e.type + '(' + x + ',' + y + ') ' + (button ? button.id : '(no button)'));
//			Calc.buttonActions[this.id]();
//			Calc.enableButtons();
//			Calc.scrollToBottom();
		}

		this.controlsDiv.addEventListener('touchstart', this, true);
		this.controlsDiv.addEventListener('touchmove', this, true);
		this.controlsDiv.addEventListener('touchend', this, true);
		this.controlsDiv.addEventListener('touchcancel', this, true);
		this.controlsDiv.addEventListener('selectstart', this, true);
	},
	
	enableButtons: function() {
		var buttons = this.buttons, l = buttons.length;
		for (var i = 0; i < l; ++i) {
			// xxx use finalNode to determine this
			buttons[i].isEnabled = true;
		}
	},

	_scrollToBottom: function() {
		// Force DOM layout update.
		document.body.offsetTop;
		this.controlsDiv.scrollIntoView();
	},

	scrollToBottom: function() {
		this._scrollToBottom();
		setTimeout(this._scrollToBottom, 0);
	},

	onLoad: function() {
		this.initializeButtons();
		this.startNewEquation();
		this.scrollToBottom();
	},
	
};

window.addEventListener('load', function() { Calc.onLoad(); }, false);
