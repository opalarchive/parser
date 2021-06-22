# parser

This is the OPAL Archive Parser, which is a BBCode and LaTeX parser used by [OPAL Archive](https://opal-archive.herokuapp.com).

## Parser

The parser is a variant of [SCEditor](https://github.com/samclarke/sceditor), except it has additional LaTeX and typescript support (as well as a bit more cleaned up with more comments). To create a parser, you can run

```ts
import Parser, { BBCode, ParserOptions } from "@opalarchive/parser";

const options = {} as ParserOptions; // Your custom options

const parser = new Parser({
  b: {},
  i: {},
  ...       // Whatever other things you want
}, options);
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

## Defaults

Here are the standard defaults:

```ts
const options = {
  // The first four options are solely for newline parsing; the implementation of the blocks are up to you
  breakBeforeBlock: false, // To automatically break before block
  breakStartBlock: false, // To automatically at start of block
  breakEndBlock: false, // To automatically at end of block
  breakAfterBlock: true, // To automatically break after block

  // The next options are simply things that can help simplify what is stored. No adverse effects occur if they are turned off.
  removeEmptyTags: true, // Whether to remove anything like [b][/b]
  fixInvalidNesting: true, // Whether to change invalid nesting (described below)
  fixInvalidChildren: true, // Whether to maintain parent-child relations

  // The next options are the delimeters used for the BBCode
  delimeters: {
    open: "[",
    close: "]",
    markClose: "/",
  },
  // Below are the LaTeX delimeters.
  latexDelimeters: [
    {
      begin: "$",
      end: "$",
    },
    {
      begin: "\\(",
      end: "\\)",
    },
    {
      begin: "\\[",
      end: "\\]",
      display: true,
    },
    {
      begin: "$$",
      end: "$$",
      display: true,
    },
  ],
  escapeDollar: true, // Whether to escape dollars (so \$ does not start LaTeX) or not
};
```

The boolean `fixInvalidNesting` refers to the following issue: sometimes users enter "invalid" syntax as

```
[inline]text[block]text[/block]text[/inline]
```

but you would prefer to change to the better "more-sanitized"

```
[inline]text[/inline][block]text[/block][inline]text[/inline]
```

The BBCode type is the following:

```ts
type BBCode = {
  isInline?: boolean; // Defaults to true
  closedBy?: string[]; // Defaults to []
  isSelfClosing?: boolean; // Defaults to false

  // The next 4 values are ignored UNLESS isInline is explicitly false
  breakBefore?: boolean; // Defaults to true
  breakAfter?: boolean; // Defaults to true
  breakStart?: boolean; // Defaults to true
  breakEnd?: boolean; // Defaults to true

  allowedChildren?: string[]; // Defaults to []
  allowsEmpty?: boolean; // Defaults to true
  allowMath?: boolean; // Defaults to true
};
```

## Rendering

The `parse` function of the parser will return an Abstract Syntax Tree. You can strategically iterate over this tree. Here are some defaults:

1. Only opening tags will have closing tags.
1. Any given environment will have all disallowed children as `content` tokens. All "types" can be found in `TagTypes`.
1. In parsing, we make a distinction between `dmath` (display math) and `imath` (inline math). This is primarily to fix block issues (i.e. we treat `dmath` as a block-level element). This may or may not interfere with your LaTeX parsing methods.
1. Most tags will have `children`, which is basically a recursive output.
1. The only tags with the `error` property will be `open[i/d]math` tags, where an error will be thrown if there is no closing tag.

## Errors

Errors, as mentioned above, will be in the `error` portion of the tag. If it is not null, it means that parsing failed (99.9999% of the time because there was no closing math tag).
