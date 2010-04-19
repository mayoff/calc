function makeParser() {

	// These change on every call to parse.
	var input, length, offset, token;
	
	// These are static.
	var tokenTypes = {},
		primitiveType = {
			parseAsPrefix: function() { throw 'Cannot use ' + this.name + ' as a prefix/standalone.'; },
			parseAsSuffix: function() { throw 'Cannot use ' + this.name + ' as a suffix.'; },
		},
		END = '(end)',
		NUMBER = '(number)',
		POINT = '(point)',
		numberRe = /[0-9]+(?:\.[0-9]*)?|\.[0-9]+/g;
	
	function parse(s) {
		input = s;
		length = input.length;
		offset = 0;
		fragments = [];
		// Set token to the first token.
		consume();
		var value = expression(0, null);
		if (token.name !== END) {
			throw [ 'Extra stuff after expression', token, ];
		}
		input = null;
		token = null;
		return value;
	}
	
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

	function simpleType(name, precedence, extensions) {
		precedence = precedence || 0;
		var type = tokenTypes[name];
		if (type) {
			type.precedence = Math.max(type.precedence, precedence);
		} else {
			type = tokenTypes[name] = beget(primitiveType, {
				name: name,
				precedence: precedence,
			});
		}
		extend(type, extensions);
		return type;
	}

	function infixType(name, precedence, extensions) {
		var type = simpleType(name, precedence, {
			parseAsSuffix: function(lhs) {
				var rhs = expression(this.isRightAssociative ? this.precedence - 1 : this.precedence, this.rightIdentity);
				return {
					number: this.computeInfix(lhs.number, rhs.number),
					html: [ lhs.html, ' ', name, ' ', rhs.html ].join(''),
				};
			},
		});
		return extend(type, extensions);
	}
	
	function prefixType(name, precedence, extensions) {
		var type = simpleType(name, undefined, {
			parseAsPrefix: function(defaultValue) {
				var rhs = expression(precedence, defaultValue);
				return {
					number: this.computePrefix(rhs.number),
					html: [ this.name, ' ', rhs.html ].join(''),
				};
			},
		});
		return extend(type, extensions);
	}

	simpleType(END, 0, {
		parseAsPrefix: function(defaultValue) {
			return {
				number: defaultValue,
				html: '<span class="endIndicator">&#x2038;</span>',
			};
		},
	});
	
	simpleType(NUMBER, undefined, {
		parseAsPrefix: function(defaultValue) {
			return {
				number: Number(text),
				html: text,
			};
		},
	});
	
	simpleType(POINT, undefined, {
		parseAsPrefix: function(defaultValue) {
			return {
				number: defaultValue,
				html: '.<span class="endIndicator">&#x2038;</span>',
			};
		},
	});

	infixType('+', 50, { rightIdentity: 0, computeInfix: function(lhs, rhs) { return lhs + rhs; }, });
	infixType('-', 50, { rightIdentity: 0, computeInfix: function(lhs, rhs) { return lhs - rhs; }, });
	infixType('*', 60, { rightIdentity: 1, computeInfix: function(lhs, rhs) { return lhs * rhs; }, });
	infixType('/', 60, { rightIdentity: 1, computeInfix: function(lhs, rhs) { return lhs / rhs; }, });
	prefixType('-', 80, { computePrefix: function(rhs) { return -rhs; }, });
	infixType('^', 90, {
		rightIdentity: 1,
		parseAsSuffix: function(lhs) {
			var rhs = expression(this.precedence - 1, this.rightIdentity);
			return {
				number: Math.pow(lhs.number, rhs.number),
				html: [ lhs.html, '<sup>', rhs.html, '</sup>' ].join(''),
			};
		},
	});
	infixType('r', 90, {
		rightIdentity: 1,
		parseAsSuffix: function(lhs) {
			var rhs = expression(this.precedence - 1, this.rightIdentity);
			return {
				number: Math.pow(lhs.number, 1 / rhs.number),
				html: [ '<sup>', rhs.html, '</sup>&#x221a<span class="radical">', lhs.html, '</span>' ].join(''),
			};
		},
	});

	simpleType('(', 100, {
		parseAsPrefix: function() {
			var value = expression(0);
			var isOpen = false;
			if (token.name === END) { isOpen = true; }
			else if (token.name == ')') { consume(); }
			else { throw 'Missing right parenthesis.'; }
			return {
				number: value.number,
				html: [ '(', value.html, isOpen ? '<span class="hint">' : '', ')', isOpen ? '</span>' : '' ].join(''),
			};
		},
	});
	simpleType(')');

	function expression(leftOpPrecedence, defaultValue) {
		var value = consume().parseAsPrefix(defaultValue);
		while (leftOpPrecedence < token.precedence) {
				value = consume().parseAsSuffix(value);
		}
		return value;
	}
	
	function lex() {
		var c;
		while (true) {
			if (offset >= length)
				return tokenTypes[END];
			c = input[offset];
			if (c !== ' ')
				break;
			++offset;
		}
		
		if (c in tokenTypes) {
			++offset;
			return tokenTypes[c];
		}
		
		if (c === '.' && offset === length - 1) {
			++offset;
			return tokenTypes[POINT];
		}

		if ('0123456789.'.indexOf(c) >= 0) {
			numberRe.lastIndex = offset;
			text = numberRe.exec(input)[0];
			offset = numberRe.lastIndex;
			return beget(tokenTypes[NUMBER], { text: text });
		}
		
		throw 'Invalid character "' + c + '" at offset ' + offset;
	}

	function consume() {
		var consumed = token;
		token = lex();
		return consumed;
	}

	return parse;
};

window.onload = function() {
	var inputDom = document.getElementById('input'), outputDom = document.getElementById('output');
	var parse = makeParser();
	
	inputDom.onchange = function() {
		try {
			var value = parse(inputDom.value);
			outputDom.style.removeProperty('color');
			outputDom.innerHTML = value.html + ' = ' + String(value.number);
		} catch (e) {
			outputDom.style.color = 'red';
			outputDom.innerText = JSON.stringify(e, null, '	   ');
		}
	};
	
	document.f.onsubmit = function(e) { e.preventDefault(); return false; };
	inputDom.focus();
};
