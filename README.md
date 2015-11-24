# Filter Text extension for Visual Studio Code

This extension filters selected text through an external shell command.
It brings the power of Unix commands such as `sort` and `uniq` into your VS Code editor.

## Usage

* Select text that you want to filter.
* Press `Ctrl+K Ctrl+F` (or press `F1` and run the command named `Filter Text`).
* Type shell command like `sort -r` and press enter.
* It replaces the selected text with the text from stdout of the command.

### NOTE

* If you didn't select anything, it simply inserts the result text at the current cursor position.


![Filter selected text](images/filtertext.gif)

## Changes

* 11/24/2015: v0.0.2 - Changed the keybindg from `Ctrl+Shift+F` to `Ctrl+K Ctrl+F`.
* 11/23/2015: v0.0.1 - Initial release.

## License

[MIT](https://github.com/yhirose/vscode-filtertext/blob/master/LICENSE)
