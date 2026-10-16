# Third-party notices

This repository is released under the [MIT License](LICENSE). That licence covers the source code and the
documentation of the repository, with the exceptions below. A file listed here is under the licence written
next to it and **not** under the MIT License, and nothing here changes the licence of the rest of the
repository.

The npm packages that the project uses keep their own licences, which are in their packages (see
`package-lock.json`).

## The list of common passwords

|                  |                                                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File             | [`src/features/auth/commonPasswords.data.ts`](src/features/auth/commonPasswords.data.ts) (and nothing else)                                                                 |
| What it is       | The most common passwords of eight characters or more, which a new password is checked against (`src/features/auth/commonPasswords.ts`).                                    |
| Licence          | [Creative Commons Attribution-ShareAlike 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/) (CC BY-SA 3.0) for the file, as an adaptation of the work below.    |
| Original work    | "10,000 Most Common Passwords List" from "10,000 Top Passwords" by **Mark Burnett** ([xato.net](https://xato.net/passwords/more-top-worst-passwords/)), 2011.               |
| Where it is from | The page of the author, as it was archived on 2014-12-06: <https://web.archive.org/web/20141206003316/https://xato.net/passwords/more-top-worst-passwords/>.                |
| Taken through    | [SecLists](https://github.com/danielmiessler/SecLists), `Passwords/Common-Credentials/10k-most-common.txt`, commit `a3416ba7062a1bc2ec6b0fe76eac7ee16c80521b` (2020-05-27). |
| Checks           | Git blob `c03abe883df8a88b7ead0a97b9862937ea6266de`, SHA-256 `4adb3f0afb4a10cf19ebe48d8c69a46f934bbc8d77c694c210564f9583e7f4ba`, 73017 bytes, 10000 lines.                  |

**Attribution.** The list is the work of Mark Burnett (xato.net). The page where he published it says that
the work is licensed under CC BY-SA 3.0, and also that the list may be used, commercial use included, with
attribution to him.

**Changes.** The file in this repository is an adaptation of the list, not the list. Every entry was put in
Unicode NFKC and in lower case; the entries with fewer than 8 or more than 128 characters (which are not
accepted as a password anyway) were removed; duplicates were removed; the rest was sorted. 2086 of the 10000
entries are left. `scripts/build-common-passwords.mjs` makes the file and refuses any list that is not the
revision above. Apart from those changes the entries are Mark Burnett's.

**Licence of the adaptation.** The adaptation is licensed under CC BY-SA 3.0, like the work it is made from:
anyone may copy, change and share the file, including commercially, if they credit Mark Burnett (xato.net),
say what they changed, and share their version of it under CC BY-SA 3.0 (or a later version of it with the
same terms), with a link to the licence. The licence applies to this file. The MIT License of this repository
does not apply to it, and the code that reads the file (`commonPasswords.ts`) is under the MIT License. The
notice is also at the top of the file, as a comment that the build keeps, so that it goes with the list into
the site and the API.

**The copy that was used.** SecLists copied the list into its repository in 2014, and the message of that
commit names the author's file as the source. The repository as a whole is under the MIT License (below),
which does not replace the licence of the author of the list; that is why the adaptation here is under the
licence of the author's work and not under the MIT License. The copy at the revision above has the same
10000 lines, in the same order, as the zip file that the author published (`10k most common.zip`, archived
in 2014); only its line endings are different.

This is a summary for the people who use the repository. It is not the licence, and it is not legal advice:
the text of the licence is what applies.

### SecLists

The MIT License of the repository that the copy was taken from:

```
MIT License

Copyright (c) 2018 Daniel Miessler

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
