import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as os from 'os';
import * as glob from 'glob';
import * as which from 'which';
import * as shell_quote from 'shell-quote';
import { dirname } from 'path';

let lastEntry: string = '';

export function activate(context: vscode.ExtensionContext) {
    let inplace = vscode.commands.registerCommand('extension.filterTextInplace', (args?: {}) => filterTextWrapper(true, args));
    let tofile = vscode.commands.registerCommand('extension.filterText', (args?: {}) => filterTextWrapper(false, args));
    let predefined = vscode.commands.registerCommand('extension.filterPredefined', (args?: {}) => filterPredefined());

    context.subscriptions.push(inplace);
    context.subscriptions.push(tofile);
    context.subscriptions.push(predefined);
}

/**
 * This implementation of the QuickPickItem contains the information necessary
 * for displaying a quickpick item, as well as the command it should execute.
 */
class Item implements vscode.QuickPickItem {
    label: string;
    description: string;

    /**
     * The literal command which the user wants to execute when this item is
     * picked from the QuickPick list.
     */
    command: string;

    constructor(label: string, description: string, command: string) {
        this.label = label;
        this.description = description;
        this.command = command;
    }

    /**
     * Runs the command.
     */
    run() {
        let cmd = {
            cmd: this.command
        };
        filterTextWrapper(true, cmd);
    }
};

/**
 * This function reads an array of predefined commands from the settings.json,
 * and displays them to the user as a quickpick.
 */
async function filterPredefined() {
    let config = (vscode.workspace.getConfiguration('filterText') as any);

    let arr: Item[] = [];

    for (let i = 0; i < config.commandList.length; i++) {
        let cmd = config.commandList[i];

        // No command name was given. The quickpick list will fail if the label
        // is undefined and therefore we warn the user and skip the iteration.
        if (!cmd.name) {
            vscode.window.showWarningMessage(`The command configured at
            index ${i} is misconfigured and will be ignored.`);
            continue;
        }

        // No command is given, so that's pretty useless. Give a warning.
        if (!cmd.command) {
            vscode.window.showWarningMessage(`The command "${cmd.name}" configured at
            index ${i} has no "command" property configured to execute, and will be ignored.`);
            continue;
        }

        arr.push(new Item(cmd.name, cmd.description, cmd.command));
    }

    // Last but not least, show the quickpick list.
    vscode.window.showQuickPick(arr).then((value: Item) => {
        if (value) {
            value.run();
        }
    });

}

async function filterTextWrapper(inplace: boolean, args?: {}) {
    if (typeof args === 'undefined') {
        vscode.window.showInputBox({
            placeHolder: 'Please enter command name and arguments.',
            value: lastEntry
        }).then(async (entry: string) => {
            filterText(inplace, entry);
        });
    } else if (('cmd' in args) && (typeof args['cmd'] === 'string')) {
        filterText(inplace, args['cmd']);
    } else {
        vscode.window.showErrorMessage('Invalid arguments passed. Must be a hash map with key \"cmd\" of type string.');
    }
}

async function filterText(inplace: boolean, entry: string) {
    if (entry) {
        const cwd = getCurrentWorkingDirectory();

        const commands = shell_quote.parse(entry).reduce((r, v) => {
            if (v.op === '|') {
                return r.concat([[]]);
            } if (v.op === 'glob') {
                const items = glob.sync(v.pattern, { cwd });
                r[r.length - 1] = r[r.length - 1].concat(items);
                return r;
            } else {
                r[r.length - 1].push(v);
                return r;
            }
        }, [[]]);

        if (!commands.length) {
          return;
        }

        lastEntry = entry; // save even if not a valid command to make it easier to fix a typo

        const range = getSelectionRange();
        let text = getTextFromRange(range);

        for (const args of commands) {
          if (!args.length) {
              return;
          }

          try {
              const name = args.shift();
              text = await executeCommand(name, args, text, { cwd });
          } catch(err) {
              vscode.window.showErrorMessage(err);
              return;
          }
        }

        setTextToSelectionRange(inplace, range, text);
    }
}

function getSelectionRange(): vscode.Selection {
    let config = (vscode.workspace.getConfiguration('filterText') as any);
    let useDocument = config.useDocumentIfEmptySelection;

    let editor = vscode.window.activeTextEditor;

    let range = undefined;
    if (!editor.selection.isEmpty) {
        range = editor.selection;
    }

    if (range === undefined) {
        if (useDocument === false) {
            let position = editor.selection.anchor;
            range = new vscode.Range(position.line, position.character, position.line, position.character);
        } else if (editor.document.lineCount > 0) {
            let lineCount = editor.document.lineCount;
            range = new vscode.Range(0, 0, lineCount, editor.document.lineAt(lineCount - 1).text.length);
        }
    }

    return range;
}

function getTextFromRange(range: vscode.Selection): string {
    if (range !== undefined) {
        let editor = vscode.window.activeTextEditor;
        return editor.document.getText(range);
    }
    return '';
}

function setTextToSelectionRange(inplace: boolean, range: vscode.Selection, text: string): void {
    let target = inplace ? Promise.resolve(vscode.window.activeTextEditor) : getTempEditor(text);
    target.then((editor) => {
        editor.edit((editBuilder) => {
            if (inplace) {
                editBuilder.replace(range, text);
            }
        });
        editor.revealRange(range);
    }, (reason: Error) => {
        vscode.window.showErrorMessage(reason.message);
    });
}

function executeCommand(name: string, args: string[], inputText: string, options: object): Promise<string> {
    let config = (vscode.workspace.getConfiguration('filterText') as any);
    let platform = os.platform();
    let bashPath = null;
    if (platform === 'win32' && config.invokeViaBash.windows === true) {
        bashPath = config.bashPath.windows; // config.bashPath.windows default to "C:/cygwin/bin/bash.exe"
    }
    return new Promise((resolve, reject) => {
        let run = (path, args, resolve) => {
            let filter = child_process.spawn(path, args, options);

            if (inputText.length > 0) {
                filter.stdin.write(inputText);
            }
            filter.stdin.end();

            let filteredText = '';
            let errorText = '';
            filter.stdout.on('data', function (data) {
                filteredText += data;
            });

            filter.stderr.on('data', function (data) {
                errorText += data;
            });
            filter.on('close', function (code: number, signal: string) {
                if (filteredText == '' && code != 0 && errorText != '') { // Only reject and show error when stdout got nothing, exit status indicate failure, and stderr got something.  E.g. grep with no match will have failure status, but no error message or output, shouldn't show error here.
                    reject("Command exits (status: " + code + ") with error message:\n" + errorText);
                } else {
                    resolve(filteredText);
                }
            });
        };
        if (bashPath === null) {
            which(name, (err, path) => {
                if (err) {
                    reject('Invalid command is entered.');
                    return;
                }
                run(path, args, resolve);
            });
        } else {
            let prependArgs;
            let cwd = options['cwd'];
            // invoke bash with "-l" (--login) option.  This is needed for Cygwin where the Cygwin's C:/cygwin/bin path may exist in PATH only after --login.
            if (cwd != null)
                prependArgs = ['-lc', 'cd "$1"; shift; "$@"', 'bash', cwd, name]; // set current working directory after bash's --login (-l)
            else
                prependArgs = ['-lc', '"$@"', 'bash', name]; // 'bash' at "$0" is the program name for stderr messages' labels.
            run(bashPath, prependArgs.concat(args), resolve);
        }
    });
}

function getTempEditor(content: string): PromiseLike<vscode.TextEditor> {
    return new Promise((resolve, reject) => {
        vscode.workspace.openTextDocument({content: content, language: "" } as any).then(
            (doc) => {
                resolve(vscode.window.showTextDocument(doc));
            },
            (err) => reject(err)
        );
    });
}

function getCurrentWorkingDirectory(): string {
    const uri = vscode.window.activeTextEditor.document.uri;

    const isFileOrUntitledDocument = uri && (uri.scheme === 'file' || uri.scheme === 'untitled');
    if (isFileOrUntitledDocument) {
        const useDocumentDirAsWorkDir = vscode.workspace.getConfiguration('filterText').useDocumentDirAsWorkDir;

        if (useDocumentDirAsWorkDir && uri.scheme === 'file') {
            return dirname(uri.fsPath);
        }

        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (folder) {
            return folder.uri.fsPath;
        }

        const folders = vscode.workspace.workspaceFolders;
        if (folders != undefined && folders.length > 0) {
            return folders[0].uri.fsPath;
        }
        // Github #9: if no workspace folders, and uri.scheme !== 'untitled' (i.e. existing file), use folder of that file. Otherwise, use user home directory.
        if (uri.scheme !== 'untitled') {
            return dirname(uri.fsPath);
        }
    }

    return os.homedir();
}
