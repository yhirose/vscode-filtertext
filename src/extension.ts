import * as vscode from 'vscode';
import * as child_process from 'child_process';
var which = require('which');
var shell_quote = require('shell-quote');
var lastCommand: string = "";

export function activate(context: vscode.ExtensionContext) {
    let inplace = vscode.commands.registerCommand('extension.filterTextInplace', () => filterText(true));
    let tofile = vscode.commands.registerCommand('extension.filterText', () => filterText(false));

    context.subscriptions.push(inplace);
    context.subscriptions.push(tofile);
}

function filterText(inplace: boolean): void {
    vscode.window.showInputBox({
        placeHolder: 'Please enter command name and arguments.',
        value: lastCommand
    }).then((entry: string) => {
        if (entry) {
            var args = shell_quote.parse(entry);
            if (!args.length) {
                return;
            }
            lastCommand = entry; // save even if not a valid command to make it easier to fix a typo
            var name = args.shift();

            which(name, (err, path) => {
                if (err) {
                    vscode.window.showErrorMessage('Invalid command is entered.');
                    return;
                }
                let config = (vscode.workspace.getConfiguration('filterText') as any);
                let useDocument = config.useDocumentIfEmptySelection;
                let editor = vscode.window.activeTextEditor;
                let filter = child_process.spawn(path, args);
                var range = undefined;
                var filteredText = '';

                if (!editor.selection.isEmpty) {
                    range = editor.selection;
                }

                if (range === undefined && editor.document.lineCount > 0 && useDocument === true) {
                    let lineCount = editor.document.lineCount;
                    range = new vscode.Range(0, 0, lineCount, editor.document.lineAt(lineCount-1).text.length);
                }

                if (range !== undefined) {
                    filter.stdin.write(editor.document.getText(range));
                    filter.stdin.end();
                }

                filter.stdout.on('data', function (data) {
                    filteredText += data;
                });
                filter.stdout.on('end', function () {
                    let target = inplace ? Promise.resolve(vscode.window.activeTextEditor) : getTempEditor(filteredText);
                    target.then((editor) => {
                        editor.edit((editBuilder) => {
                            if (inplace) {
                                editBuilder.replace(range, filteredText);
                            }
                        });
                        editor.revealRange(range);
                    }, (reason: Error) => {
                        vscode.window.showErrorMessage(reason.message);
                    });
                 
                });
            });
        }
    });
}

function getTempEditor(content: string) : PromiseLike<vscode.TextEditor> {
    return new Promise((resolve, reject) => {
        vscode.workspace.openTextDocument({content: content, language: "" } as any).then(
            (doc) => {
                resolve(vscode.window.showTextDocument(doc));
            },
            (err) => reject(err)
        );
    });
}