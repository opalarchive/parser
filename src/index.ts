import Parser from "./Parser";
export { default, Token, BBCode, ParserOptions } from "./Parser";

const parser = new Parser({ b: {}, i: {} });
console.log(parser.parse("[b]My name is [i]OPAL Archive.[/i][/b]"));
