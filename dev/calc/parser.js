Parser = {

	reset: function(input) {
		this._input = input;
		this._inputOffset = 0;
		this._consume();
		return this;
	},

	_beget: function(base, properties) {
		function constructor() {}
		constructor.prototype = base;
		var object = new constructor(), key;
		for (key in properties) {
			object[key] = properties[key];
		}
		return object;
	},
	
	///////////////////////////////////////////////////////////////////////////
	// Lexical analysis

	// The entire input string.
	_input: null,
	
	// The index of the next untokenized byte in _input.
	_inputOffset: null,
	
	// The current, unconsumed token.
	_token: null,
	
	_consume: function() {
		var consumed = this._token;
		this._token = this._lex();
		return consumed;
	},
	
	Token: {
		toString: function() {
			return 'Token(' + this.type + ' "' + this.text + '" at ' + this.offset + ')';
		},
		
		Type_End: '(end)',
	},

	
	_makeToken: function(type, length) {
		if (length === undefined) {
			length = type.length;
		}
		var token = this._beget(this.Token, {type: type, text: this._input.substr(this._inputOffset, length), offset: this._inputOffset});
		this._inputOffset += length;
		return token;
	},

	_numberRe: /[0-9]+(?:\.[0-9]*)?|\.[0-9]+/g,

	_lex: function() {
		var l = this._input.length, c;
		while (this._inputOffset < l) {
			c = this._input[this._inputOffset];
			if (c !== ' ')
				break;
			++this._inputOffset;
		}
		if (this._inputOffset >= l) {
			return this._makeToken(this.Token.Type_End, 0);
		}

		if ('+-*/()^'.indexOf(c) >= 0) {
			return this._makeToken(c);
		}

		if ('0123456789.'.indexOf(c) >= 0) {
			this._numberRe.lastIndex = this._inputOffset;
			return this._makeToken('number', this._numberRe.exec(this._input)[0].length);
		}

		throw 'Invalid character "' + c + '" at offset ' + this._inputOffset;
	},
	
	///////////////////////////////////////////////////////////////////////////
	// Syntatic analysis

	expression: function(leftOpPrecedence) {		
		var node = this._consume().parseAsPrefix();
		while (leftOpPrecedence < this._token.precedence) {
			node = this._consume().parseAsInfix(node);
		}
		return left;
	},

};
