# parser
This is the OPAL Archive Parser, which is a BBCode and LaTeX parser used by [OPAL Archive](https://opal-archive.herokuapp.com).
## Parser
The parser is a variant of [SCEditor](https://github.com/samclarke/sceditor), except it has additional LaTeX and typescript support (as well as a bit more cleaned up with more comments). To create a parser, you can run
```ts
import Parser, { BBCode } from "@opalarchive/parser";

const parser = new Parser({
  b: {
    execute: // Figure out what this should actually be, not implemented yet
  },
  i: {
    execute: // Figure out what this should actually be, not implemented yet
  }
});
```
To use your new parser, you can pass in a string to the parse function and it'll spit out the tokenized array:
```ts
parser.parse("[b]My name is [i]OPAL Archive.[/i][/b]");
```
which should return the following:
```ts
[
  Token {
    type: "open",
    name: "b",
    value: "[b]",
    attrs: {},
    children: [ [Token], [Token] ],
    closing: Token
  }
]
```
