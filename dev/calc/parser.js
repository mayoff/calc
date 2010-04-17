if (this.console === undefined) {
	this.console = {
		log: function(s) { print(s); }
	}
}

function parse(input) {

	function beget(base, properties) {
		function constructor() {}
		constructor.prototype = base;
		var object = new constructor(), key;
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
	
	var primitiveNode = {
		parseAsPrefix: function() { throw 'Cannot use this kind of token as a prefix/standalone.'; },
		parseAsSuffix: function() { throw 'Cannot use this kind of token as a suffix.'; },
	};
	
	function makeEnd() {
		return beget(primitiveNode, {
			toString: function() { return '(end)'; },
			precedence: 0,
		});
	}

	function makeNumber(textLength) {
		var text = Number(input.substr(offset, textLength));
		offset += textLength;
		return beget(primitiveNode, {
			toString: function() { return text; },
			parseAsPrefix: function() { return this; },
			precedence: 0,
		});
	}
	
	function makeInfix(precedence) {
		var operator = input[offset];
		++offset;
		return beget(primitiveNode, {
			toString: function() { return [ '(', this.lhs.toString(), ' ', this.operator, ' ', this.rhs.toString(), ')' ].join(''); },
			operator: operator,
			precedence: precedence,
			parseAsSuffix: function(lhs) {
				this.lhs = lhs;
				this.rhs = expression(this.precedence);
				return this;
			},
		});
	}

	numberRe = /[0-9]+(?:\.[0-9]*)?|\.[0-9]+/g;

	function lex() {
		var c;
		while (offset < length) {
			c = input[offset];
			if (c !== ' ')
				break;
			++offset;
		}
		if (offset >= length) {
			return makeEnd();
		}

		switch (c) {
			case '+': return makeInfix(50);
			case '-': return makeInfix(50);
			case '*': return makeInfix(60);
			case '/': return makeInfix(60);
			case '^': return makeInfix(80);
		}

		if ('0123456789.'.indexOf(c) >= 0) {
			numberRe.lastIndex = offset;
			return makeNumber(numberRe.exec(input)[0].length);
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
}

console.log(parse('123 + 4.56^.78  ').toString());
