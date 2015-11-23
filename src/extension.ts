import * as vscode from 'vscode';
import * as child_process from 'child_process';
var which = require('which');
var shell_quote = require('shell-quote');

export function activate(context: vscode.ExtensionContext) {

    var disposable = vscode.commands.registerCommand('extension.filterText', () => {
        vscode.window.showInputBox({
            placeHolder: 'Plese enter command name and arguments.'
        }).then((entry: string) => {
            if (entry) {
                var args = shell_quote.parse(entry);
                if (!args.length) {
                    return;
                }
                var name = args.shift();

                which(name, (err, path) => {
                    if (err) {
                        vscode.window.showErrorMessage('Invalid command is entered.');
                        return;
                    }
                    var filteredText = '';
                    var editor = vscode.window.activeTextEditor;
                    var filter = child_process.spawn(path, args);
                    if (!editor.selection.isEmpty) {
                        filter.stdin.write(editor.document.getText(editor.selection));
                        filter.stdin.end();
                    }
                    filter.stdout.on('data', function (data) {
                        filteredText += data;
                    });
                    filter.stdout.on('end', function () {
                        editor.edit((editBuilder) => {
                            editBuilder.replace(editor.selection, filteredText);
                        });
                    });
                });
            }
        });
    });

    context.subscriptions.push(disposable);
}
