import * as vscode from 'vscode';
import * as child_process from 'child_process';
var which = require('which');
var shell_quote = require('shell-quote');
var tmp = require('tmp');

export function activate(context: vscode.ExtensionContext) {
    let inplace = vscode.commands.registerCommand('extension.filterTextInplace', () => filterText(true));
    let tofile = vscode.commands.registerCommand('extension.filterText', () => filterText(false));

    context.subscriptions.push(inplace);
    context.subscriptions.push(tofile);
}

function filterText(inplace: boolean): void {
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
                    let target = inplace ? Promise.resolve(vscode.window.activeTextEditor) : getTempEditor();
                    target.then((editor) => {
                        editor.edit((editBuilder) => {
                            editBuilder.replace(editor.selection, filteredText);
                        });
                    }, (reason: Error) => {
                        vscode.window.showErrorMessage(reason.message);
                    });
                 
                });
            });
        }
    });
}

function getTempEditor() : PromiseLike<vscode.TextEditor> {
    return new Promise((resolve, reject) => {
        tmp.file((err, path, fd, cleanupCallback) => {
            if (err) {
                reject(err);
                return;
            }
            vscode.workspace.openTextDocument(path).then(
                (doc) => {
                    resolve(vscode.window.showTextDocument(doc));
                },
                (err) => reject(err)
            );
        });
    });
}