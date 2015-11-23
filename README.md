# Filter Text extension for Visual Studio Code

This extension filters selected text through an external shell command.
It brings the power of Unix commands such as `sort` and `uniq` into your VS Code editor.

## Usage

* Select text that you want to filter.
* Press `Ctrl+Shift+F` or press `F1` and run the command named `Filter Text`.
* Type shell command like `sort -r` and press enter.
* It replaces the selected text with the filtered text.

### NOTE

* If you didn't select anything, it inserts the result text from the shell command at the current cursor position.


![Filter selected text](images/filtertext.gif)

## License

[MIT](https://github.com/yhirose/vscode-filtertext/blob/master/LICENSE)
