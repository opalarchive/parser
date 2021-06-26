export type TagTypes =
  | "escapedollar"
  | "opendmath"
  | "closedmath"
  | "openimath"
  | "closeimath"
  | "open"
  | "close"
  | "newline"
  | "content";

/**
 * There's a reason we differentiate between display and inline math (even
 * though we don't do rendering): display math is a block-level element, so must
 * be treated as such. Thus, in the fixNewlines function, we also check this.
 */
export type LatexDelimeter = {
  begin: string;
  end: string;
  display?: boolean;
};

export type ParserOptions = {
  breakBeforeBlock?: boolean;
  breakStartBlock?: boolean;
  breakEndBlock?: boolean;
  breakAfterBlock?: boolean;
  removeEmptyTags?: boolean;
  fixInvalidNesting?: boolean;
  fixInvalidChildren?: boolean;
  delimeters?: { open: string; close: string; markClose: string };
  latexDelimeters?: LatexDelimeter[];
  escapeDollar?: boolean;
};

const ParserDefaults: ParserOptions = {
  breakBeforeBlock: false,
  breakStartBlock: false,
  breakEndBlock: false,
  breakAfterBlock: true,
  removeEmptyTags: true,
  fixInvalidNesting: true,
  fixInvalidChildren: true,
  delimeters: { open: "[", close: "]", markClose: "/" },
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
  escapeDollar: true,
};

/**
 * A helper function (stolen from MathJax) to convert strings to
 * regex-compatible strings
 *
 * @param { string } text Text we want to escape for Regex use
 * @returns { string } A regex-compatible string
 */
export function escapeRegex(text: string): string {
  return text.replace(/([\^$(){}+*?\-|\[\]\:\\])/g, "\\$1");
}

/**
 * The BBCode type. Here are the default assumptions:
 *  - isInline: true
 *  - closedBy: []
 *  - isSelfClosing: false
 *  - breakBefore: true
 *  - breakAfter: true
 *  - breakEnd: true
 *  - allowsEmpty: true
 *  - allowsMath: true
 */
export type BBCode = {
  isInline?: boolean;
  closedBy?: string[];
  isSelfClosing?: boolean;
  breakBefore?: boolean;
  breakAfter?: boolean;
  allowedChildren?: string[];
  breakStart?: boolean;
  breakEnd?: boolean;
  allowsEmpty?: boolean;
  allowMath?: boolean;
};

/**
 * @class Token
 *
 * @classdesc This is a class to hold tokens.
 */
export class Token {
  public type: TagTypes;
  public name: string;
  public value: string;
  public attrs: { [key: string]: string };
  public children: Token[];
  public closing: Token | null;
  public error: string;

  /**
   * @param type The type of tag
   * @param name The name of the tag
   * @param value The content/value of the tag
   * @param attrs The tag attributes
   * @param children The children of the tag
   * @param closing The closing tag (only if there is an opening tag)
   */
  constructor(
    type: TagTypes,
    name: string,
    value: string,
    attrs: { [key: string]: string } = {},
    children: Token[] = [],
    closing: Token = null,
    error: string = ""
  ) {
    this.type = type;
    this.name = name;
    this.value = value;
    this.attrs = attrs;
    this.children = children;
    this.closing = closing;
    this.error = error;

    if (
      !["open", "openimath", "closeimath", "opendmath", "closedmath"].some(
        (el) => type === el
      ) &&
      !!closing
    )
      throw "A closing tag should only appear with an opening tag!";
  }

  /**
   * Clone the current element without children
   *
   * @returns A clone of the current token, without children
   */
  public clone(): Token {
    return new Token(
      this.type,
      this.name,
      this.value,
      this.attrs,
      [],
      this.closing ? this.closing.clone() : null,
      this.error
    );
  }

  /**
   * Get a clone of the current object after the provided child
   *
   * @param child The child at which to split at
   * @returns A clone of the current token with children after child
   */
  public splitAt(child: Token): Token {
    let clone = this.clone(),
      offset = this.children.indexOf(child);

    if (offset > -1) clone.children = this.children.splice(offset);

    return clone;
  }
}

/**
 * @todo Put these todos in the right place, not just all up here
 * @todo Make fixNewlines actually fix newlines around dmath
 * @todo Add ref support?
 */
export default class Parser {
  private options: ParserOptions;
  private tokenTypes: {
    [key in TagTypes]: RegExp;
  };
  private tokenOrder = [
    "escapedollar",
    "opendmath",
    "closedmath",
    "openimath",
    "closeimath",
    "close",
    "open",
    "newline",
    "content",
  ];
  private tagDelimeters = { open: "[", close: "]", markClose: "/" };
  private handlers: { [key: string]: BBCode } = {};
  private end: { [key: string]: string } = {};

  /**
   * @todo Document constructor
   */
  constructor(
    handlers: { [key: string]: BBCode } = {},
    options?: ParserOptions
  ) {
    this.options = Object.assign({}, ParserDefaults, options);

    this.tagDelimeters = Object.assign(
      this.tagDelimeters,
      this.options.delimeters || {}
    );
    this.options.delimeters = {
      open: this.tagDelimeters.open,
      close: this.tagDelimeters.close,
      markClose: this.tagDelimeters.markClose,
    };
    const openStart = this.tagDelimeters.open[0];
    Object.keys(this.tagDelimeters).forEach(
      (key) => (this.tagDelimeters[key] = escapeRegex(this.tagDelimeters[key]))
    );

    this.options.latexDelimeters.forEach(
      (el) => el.begin && (this.end[el.begin] = el.end)
    );

    const { open, close, markClose } = this.tagDelimeters;
    let endContent = [openStart] as string[];
    this.options.latexDelimeters.forEach((el) =>
      endContent.push(el.begin[0], el.end[0])
    );
    endContent = [...new Set(endContent)].map((delim) => escapeRegex(delim));
    this.tokenTypes = {
      content: new RegExp(
        `^([^${endContent.join("")}\r\n]+|${endContent.join("|")})`
      ),
      newline: new RegExp(`^(\r\n|\r|\n)`),
      open: new RegExp(`^${open}[^${open}${close}]+${close}`),
      close: new RegExp(`^${open}${markClose}[^${open}${close}]+${close}`),
      escapedollar: /^\\\$/,
      opendmath: new RegExp(
        `^(${this.options.latexDelimeters
          .filter((el) => el.display)
          .map((delim) => escapeRegex(delim.begin))
          .join("|")})`
      ),
      closedmath: new RegExp(
        `^(${this.options.latexDelimeters
          .filter((el) => el.display)
          .map((delim) => escapeRegex(delim.end))
          .join("|")})`
      ),
      openimath: new RegExp(
        `^(${this.options.latexDelimeters
          .filter((el) => !el.display)
          .map((delim) => escapeRegex(delim.begin))
          .join("|")})`
      ),
      closeimath: new RegExp(
        `^(${this.options.latexDelimeters
          .filter((el) => !el.display)
          .map((delim) => escapeRegex(delim.end))
          .join("|")})`
      ),
    };

    this.handlers = handlers;

    if (!this.options.escapeDollar) this.tokenOrder.shift();
  }

  /**
   * Strip quotes from a string. For example,
   *    stripQuotes('"I am \\"invincible\\" today"')
   * returns 'I am "invincible" today'.
   *
   * @param { string } str The string to strip quotes from
   * @returns str with quotes stripped from it
   */
  private stripQuotes(str: string): string {
    return str
      ? str.replace(/\\(.)/g, "$1").replace(/^(["'])(.*?)\1$/, "$2")
      : str;
  }

  /**
   * Extracts the individual attributes from a string containing
   * all the attributes.
   *
   * @param { string } attrs
   * @return { [key: string]: string } The associated array of attributes
   * @private
   */
  private tokenizeAttrs(attrs: string): { [key: string]: string } {
    /**
     * @var matches An array of matches
     * @var attrRegex This is a regex that checks the attributes:
     *
     *  ([^\s=]+)               Not whitespace or equals
     *  =                       Equals sign
     *  (?:
     *    (?:
     *      (["'])              An opening quote (" or ')
     *      (
     *        (?:\\\2|[^\2])*   Not the unescaped opening quote
     *      ?)
     *      \2                  The opening quote (or closing here)
     *    )
     *      |
     *    (
     *      (?:.(?!\s\S+=))*.   Other "splitting" characters between attributes
     *    )
     *  )
     *
     * @var attributes The object of attributes
     */
    var matches,
      attrRegex =
        /([^\s=]+)=(?:(?:(["'])((?:\\\2|[^\2])*?)\2)|((?:.(?!\s\S+=))*.))/g,
      attributes: { [key: string]: string } = {};

    // If there is only the default attribute, strip it and add it.
    if (attrs.charAt(0) === "=" && attrs.indexOf("=", 1) < 0) {
      attributes.defaultattr = this.stripQuotes(attrs.substr(1));
    } else {
      // If there is also the default attribute, strip it and add it.
      if (attrs.charAt(0) === "=") {
        attrs = "defaultattr" + attrs;
      }

      // No need to strip quotes here, the regex will do that. Loop over all
      // other attributes and add them to the object.
      while ((matches = attrRegex.exec(attrs))) {
        attributes[matches[1].toLowerCase()] =
          this.stripQuotes(matches[3]) || matches[4];
      }
    }

    return attributes;
  }

  /**
   * Parse the tag and convert it into a token.
   *
   * @param { TagTypes } type The type of tag
   * @param { string } val The actual tag
   * @returns { Token } The token the tag was derived from.
   */
  private tokenizeTag(type: TagTypes, val: string): Token {
    const { open, close, markClose } = this.tagDelimeters;
    /**
     * @var matches Things that match openRegex
     * @var attrs Parsed attributes
     * @var openRegex Regex to test if we're at an open tag
     *
     *  ${open}             The open tag (default [)
     *  (
     *    [^${close}\s=]+   Anything that's not close, spaces, or equal
     *                        (i.e. the main tag name)
     *                      BE CAREFUL - I FORGOT TO ESCAPE THE \ in \s
     *  )
     *  (
     *    ?:(
     *      [^${close}]+    Anything that's not close (default ])
     *    )
     *  )?
     *  ${close}            The close tag (default ])
     *
     * @var closeRegex Regex to test if we're at a close tag.
     *
     *  ${open}                 The open tag (default [)
     *  ${markClose}            The character that symbolizes a close tag
     *                            (default /)
     *  (
     *    [^${open}${close}]+   Anything that's not an open or close tag
     *  )
     *  ${close}                The close tag (default ])
     */
    let matches,
      attrs,
      name,
      openRegex = new RegExp(
        `${open}([^${close}\\s=]+)(?:([^${close}]+))?${close}`
      ),
      closeRegex = new RegExp(
        `${open}${markClose}([^${open}${close}]+)${close}`
      );

    // If it's a non-content tag, we have to extract a special name (we check
    // with this.handlers to make sure the tag is wanted by the user)
    if (type === "open" && (matches = val.match(openRegex))) {
      console.log(matches);
      name = matches[1].toLowerCase();

      if (matches[2] && (matches[2] = matches[2].trim()))
        attrs = this.tokenizeAttrs(matches[2]);
    } else if (type === "close" && (matches = val.match(closeRegex)))
      name = matches[1].toLowerCase();
    else if (type === "newline") name = "#newline";
    else if (type === "escapedollar") {
      type = "escapedollar";
      name = "#";
    } else if (
      ["openimath", "opendmath", "closeimath", "closedmath"].some(
        (el) => el === type
      )
    )
      name = val;

    if (
      !name ||
      ((type === "open" || type === "close") && !this.handlers[name])
    ) {
      type = "content";
      name = "#";
    }

    return new Token(type, name, val, attrs);
  }

  /**
   * Takes a string (such as [b]Hello[/b]) and tokenizes it to:
   *
   * [
   *  Token {
   *    type: 'open',
   *    name: 'b',
   *    value: '[b]',
   *    attrs: {},
   *    children: [],
   *    closing: null
   *  },
   *  Token {
   *    type: 'content',
   *    name: '#',
   *    value: 'Hello',
   *    attrs: {},
   *    children: [],
   *    closing: null
   *  },
   *  Token {
   *    type: 'close',
   *    name: 'b',
   *    value: '[/b]',
   *    attrs: {},
   *    children: [],
   *    closing: null
   *  }
   * ]
   *
   * @param { string } text The text to tokenize
   * @returns { Token[] } an array of tokens as described above
   */
  private tokenize(text: string): Token[] {
    let matches: string[] = [],
      type: string = "",
      tokens: Token[] = [];

    /**
     * @var mainLoop The main loop to iterate through
     *
     * In this loop, we look for a match in the order given by this.tokenOrder,
     * and when we find one, we parse it and add it to the array. Then, we cut
     * it out from the actual text and continue looping.
     */
    mainLoop: while (text.length) {
      for (let i = 0; i < this.tokenOrder.length; i++) {
        type = this.tokenOrder[i];

        if (!(matches = text.match(this.tokenTypes[type])) || !matches[0])
          continue;

        tokens.push(this.tokenizeTag(type as TagTypes, matches[0]));

        text = text.substr(matches[0].length);

        continue mainLoop;
      }

      if (text.length) tokens.push(this.tokenizeTag("content", text));

      text = "";
    }
    return tokens;
  }

  /**
   * Utility function to check if a (child) tag is allowed to be rendered
   *
   * @param tag The parent tag name
   * @param child The child tag name
   * @returns Whether the BBCode allows the tag to be rendered
   */
  private isAllowed(tag: string, child?: string): boolean {
    const parent = this.handlers[tag] || {};

    if (this.options.fixInvalidChildren && parent.allowedChildren)
      return parent.allowedChildren.indexOf(child || "#") > -1;

    return true;
  }

  /**
   * Checks if a tag can close another
   *
   * @param tag The name of the opening tag
   * @param closing The name of the closing tag
   * @returns If the closing tag can close the opening tag
   */
  private closesTag(tag: string, closing: string): boolean {
    let bbcode = this.handlers[tag];
    return bbcode && bbcode.closedBy && bbcode.closedBy.indexOf(closing) > -1;
  }

  /**
   * A utility function to check if a certain token (name and type) exists
   *
   * @param name The name of the token
   * @param type The type of the token
   * @param array The array of tokens
   * @returns If in the array we have a token of matching name and type
   */
  private hasTag(name: string, type: TagTypes, array: Token[]): boolean {
    return array.some((el) => el.name === name && el.type === type);
  }

  /**
   * This function fixes the problem of
   *    [inline]text[block]text[/block]text[/inline]
   * to the better "more-sanitized"
   *    [inline]text[/inline][block]text[/block][inline]text[/inline]
   *
   * @param main A main array of tokens to iterate through
   * @param parents Parents of the main array
   * @param inline Whether we are currently in an inline environment
   * @param root The root (original) array
   */
  private fixInvalidNesting(
    main: Token[],
    parents: Token[] = [],
    inline?: boolean,
    root: Token[] = main
  ): void {
    let token: Token,
      parent: Token,
      parentIdx: number,
      heirarchyChildren: Token[],
      right: Token,
      clone: Token;

    const isInline = (tag: string) => {
      const bbcode = this.handlers[tag];
      return !bbcode || bbcode.isInline !== false;
    };

    for (let i = 0; i < main.length; i++) {
      if (!(token = main[i]) || token.type !== "open") continue;

      // We have the mentioned scenario, so we cut it out, paste it, and recurse
      if (!!inline && !isInline(token.name)) {
        parent = parents[parents.length - 1];
        right = parent.splitAt(token);
        heirarchyChildren =
          parents.length > 1 ? parents[parents.length - 2].children : root;

        // If the tag is allowed to exist, put it inside (note this is very
        // selective; it remaps
        //    [tag][inline]text[block]text[/block]text[/inline][/tag]
        // to
        //    [tag][inline]text[/inline][/tag]
        //    [block][tag]text[/tag][/block]
        //    [tag][inline]text[/inline][/tag]
        if (this.isAllowed(token.name, parent.name)) {
          clone = parent.clone();
          clone.children = token.children;
          token.children = [clone];
        }

        // We now splice and recombine the parent with the fixed child.
        parentIdx = heirarchyChildren.indexOf(parent);
        if (parentIdx > -1) {
          right.children.splice(0, 1);
          heirarchyChildren.splice(parentIdx + 1, 0, token, right);

          if (
            (clone = right.children[0]) &&
            clone.type === "newline" &&
            !isInline(token.name)
          ) {
            right.children.splice(0, 1);
            heirarchyChildren.splice(parentIdx + 2, 0, clone);
          }

          return;
        }
      }

      // Add the current token to the parents, recurse, and then remove it.
      parents.push(token);
      this.fixInvalidNesting(
        token.children,
        parents,
        inline || isInline(token.name),
        root
      );
      parents.pop();
    }
  }

  /**
   * This is a helper function that fixes newlines, making the new array more
   * "sanitized" and less "redundant"
   *
   * @param children The array of nodes to fix
   * @param parent Only used for recursion purposes; the parent of all children
   */
  private fixNewlines(children: Token[], parent?: Token): void {
    let token: Token,
      left: Token,
      right: Token,
      parentBBCode = this.handlers[parent?.name] || null,
      bbcode,
      remove: boolean = false,
      removedBreakStart: boolean = false,
      removedBreakEnd: boolean = false;

    for (let i = children.length; i >= 0; i--) {
      if (!(token = children[i])) continue;

      // If it's an open tag, just recurse downwards
      if (token.type === "open") this.fixNewlines(token.children, token);
      else if (token.type === "newline") {
        left = children[i - 1] || null;
        right = children[i + 1] || null;
        remove = false;

        // If it's of the form [tag]\n text\n[/tag], fix it (if needed)
        if (parentBBCode && parentBBCode.isSelfClosing !== true) {
          // First child of parent (i.e. [tag]\n); there are two cases:
          // * If the default is to break and it's not specified to not break,
          // * If the parent breaks at the start
          if (
            !left &&
            ((parentBBCode.isInline === false &&
              this.options.breakStartBlock &&
              parentBBCode.breakStart !== false) ||
              parentBBCode.breakStart)
          )
            remove = true;
          // Last child of parent (i.e. \n[/tag])
          else if (!removedBreakEnd && !right) {
            // There are two cases:
            // * If the default is to break and it's not specified to not break,
            // * If the parent breaks at the end
            if (
              (parentBBCode.isInline === false &&
                this.options.breakEndBlock &&
                parentBBCode.breakEnd !== false) ||
              parentBBCode.breakEnd
            )
              remove = true;

            removedBreakEnd = remove;
          }
        }

        // If it's of the type [tag /]\n and it's a block element with correct
        // parameters, then remove the extra newline. We remove it if there is a
        // break (i.e. block element) and we're trying to remove it.
        // prettier-ignore
        if (
          !!left &&                                 // If left exists
          left.type === "open" &&                   // And is a tag
          (bbcode = this.handlers[left.name]) &&    // And the bbcode exists
          (                                         // And the following hold:
            (
              bbcode.isInline === false &&          // The bbcode is not inline
              this.options.breakAfterBlock &&       // We break after block
              bbcode.breakAfter !== false           // It is not specified to
                                                    //  not break
            ) ||                                    // or
            bbcode.breakAfter                       // We automatically break
          )
        )
          remove = true;

        // If it's of the form \n [tag /] then we do similar calculations and
        // remove the newline if needed
        if (
          !removedBreakStart &&
          right &&
          right.type === "open" &&
          (bbcode = this.handlers[right.name])
        ) {
          if (
            (bbcode.isInline === false &&
              this.options.breakBeforeBlock &&
              bbcode.breakBefore !== false) ||
            bbcode.breakBefore
          )
            remove = true;

          removedBreakStart = remove;
        }

        // If we're supposed to remove the newline then remove it
        if (remove) children.splice(i, 1);
      }
    }
  }

  /**
   * Remove any tags such as [tag][/tag] that are not supposed to be empty
   *
   * @param tokens The tokens to remove the empty tags from
   */
  private removeEmptyTags(tokens: Token[]): void {
    let token: Token, bbcode;

    const isWhitespace = (children: Token[]): boolean => {
      for (let i = 0; i < children.length; i++) {
        if (children[i].type === "open" || children[i].type === "close")
          return false;
        if (
          children[i].type === "content" &&
          /\S|\u00A0/.test(children[i].value)
        )
          return false;
      }
      return true;
    };

    for (let i = 0; i < tokens.length; i++) {
      if (!(token = tokens[i]) || token.type !== "open") continue;

      // Operate on children, then we'll remove empty children
      this.removeEmptyTags(token.children);

      // Remove the empty children
      if (
        isWhitespace(token.children) &&
        (bbcode = this.handlers[token.name]) &&
        !bbcode.isSelfClosing &&
        !bbcode.allowsEmpty
      )
        tokens.splice.apply(tokens, ([i, 1] as any).concat(token.children[0]));
    }
  }

  /**
   * Parses text into an AST as defined by this.handlers (provided in options)
   *
   * @param text The text to parse into an AST
   * @returns The text, converted into an AST
   */
  public parse(text: string) {
    const tokens = this.tokenize(text);
    let token: Token,
      next: Token,
      openTags: Token[] = [],
      output: Token[] = [],
      bbcode,
      current: Token,
      clone: Token,
      cloned: Token[] = [];

    const currentTag = () => openTags[openTags.length - 1];
    const addTag = (token: Token) =>
      currentTag() ? currentTag().children.push(token) : output.push(token);

    while ((token = tokens.shift())) {
      next = tokens[0];

      if (token.type === "openimath" || token.type === "opendmath") {
        // A verbatim or code environment where math is not allowed
        if (
          openTags
            .filter((tag) => !!tag)
            .some((tag) => this.handlers[tag.name].allowMath === false)
        ) {
          token.type = "content";
          addTag(token);
          continue;
        }

        if (
          !(
            this.hasTag(
              this.end[token.name],
              token.type.replace("open", "close") as TagTypes,
              tokens
            ) || this.hasTag(this.end[token.name], token.type, tokens)
          )
        ) {
          // This means the user does something like $2+3, which basically means throw error
          token.error = `The corresponding closing tag for ${token.name} was not found`;
          tokens.forEach((tok) => {
            tok.type = "content";
            token.children.push(tok);
          });
          tokens.length = 0;

          // Add it to the output or the parent open tag
          addTag(token);

          let tok;

          // Close all of the open tags now
          while (openTags.length > 0) {
            tok = openTags.pop();
            tok.closing = new Token(
              "close",
              tok.name,
              `${this.options.delimeters.open}${this.options.delimeters.markClose}${tok.name}${this.options.delimeters.close}`
            );
          }

          break;
        }

        // It has a closing token, so we just iterate through everything until that point and then just deal with the closing there
        let tok;

        while (
          (tok = tokens.shift()) &&
          !(
            (tok.type === (token.type.replace("open", "close") as TagTypes) ||
              tok.type === token.type) &&
            tok.name === this.end[token.name]
          )
        ) {
          tok.type = "content";
          token.children.push(tok);
        }

        token.closing = tok;
        addTag(token);
        continue;
      }

      // If for some of its parents, we don't render the child, we don't render
      // However, we check it's not the current tag's closing tag.
      if (
        openTags
          .filter((tag) => !!tag)
          .some((tag) => !this.isAllowed(tag.name, token.name))
      ) {
        if (token.type !== "close" || token.name !== currentTag().name) {
          token.name = "#";
          token.type = "content";
        }
      }

      if (token.type === "open") {
        if (currentTag() && this.closesTag(currentTag().name, token.name))
          openTags.pop();

        // If we have an open tag, add it to its children - otherwise to the
        // output.
        addTag(token);

        bbcode = this.handlers[token.name];

        // If the code is not self closing, then add it to the stack of tokens
        if (bbcode && !bbcode.isSelfClosing) {
          if (bbcode.closedBy || this.hasTag(token.name, "close", tokens))
            openTags.push(token);
          else token.type = "content";
        }
      } else if (token.type === "close") {
        // While it closes the current tag, pop the tag off (it's done)
        while (
          currentTag() &&
          token.name !== currentTag().name &&
          this.closesTag(currentTag().name, `/${token.name}`)
        )
          openTags.pop();

        // If this is the closing tag, mark it and be done
        if (currentTag() && token.name === currentTag().name) {
          currentTag().closing = token;
          openTags.pop();
        }
        // Otherwise, keep iterating up open tags until we reach the parent.
        // Then, we push everything and then end by adding the open ones back to
        // openTags.
        else if (this.hasTag(token.name, "open", openTags)) {
          while ((current = openTags.pop())) {
            if (current.name === token.name) {
              current.closing = token;
              break;
            }

            clone = current.clone();

            if (cloned.length > 0)
              clone.children.push(cloned[cloned.length - 1]);

            cloned.push(clone);
          }

          if (next && next.type === "newline") {
            bbcode = this.handlers[token.name];
            if (bbcode && bbcode.isInline === false) {
              addTag(next);
              tokens.shift();
            }
          }

          addTag(cloned[cloned.length - 1]);

          for (let i = cloned.length - 1; i >= 0; i--) openTags.push(cloned[i]);

          cloned = [];
        }
        // Otherwise, it's a throw-away tag that never has an opening, so we
        // make it content.
        else {
          token.type = "content";
          addTag(token);
        }
      } else if (token.type === "newline") {
        // Deal with cases such as [*]item\n[*]item
        // Only deal with this case if it's not explicitly [*]item\n[/*]
        if (
          currentTag() &&
          next &&
          this.closesTag(
            currentTag().name,
            `${next.type === "close" ? "/" : ""}${next.name}`
          ) &&
          !(next.type === "close" && next.name === currentTag.name)
        ) {
          // Ignore it if it's automatically supposed to have a newline
          // afterwards
          if ((bbcode = this.handlers[currentTag().name]) && bbcode.breakAfter)
            openTags.pop();
          else if (
            bbcode &&
            bbcode.isInline === false &&
            this.options.breakAfterBlock
          )
            openTags.pop();
        }

        addTag(token);
      } else addTag(token);
    }

    if (this.options.fixInvalidNesting) this.fixInvalidNesting(output);

    this.fixNewlines(output);

    if (this.options.removeEmptyTags) this.removeEmptyTags(output);

    return output.filter((el) => !!el);
  }
}
