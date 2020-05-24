// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Z_FILTERED } from 'zlib';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "simpletabletocsvtable" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('simpletabletocsvtable.helloworld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from SimpleTableToCsvTable!');
	});

	let convert = vscode.commands.registerCommand('simpletabletocsvtable.convert', () => {
		let editor = vscode.window.activeTextEditor; // エディタ取得
		if(editor === undefined || editor === null){
			return;
		}
		let doc = editor.document;            // ドキュメント取得
		let cur_selection = editor.selection; // 選択範囲取得
		if(editor.selection.isEmpty){         
			// 選択範囲が空であれば全てを選択範囲にする
			let startPos = new vscode.Position(0, 0);
			let endPos = new vscode.Position(doc.lineCount - 1, 10000);
			cur_selection = new vscode.Selection(startPos, endPos);
		}
		
		let text = doc.getText(cur_selection); //取得されたテキスト
		
		var convertor = new Convertor('=== =====\n\
		aaa bbbbb\n\
		=== =====\n\
		aaa ccccc\n\
		あa いうd\n\
		=== =====');
		
		
		//エディタ選択範囲にテキストを反映
		editor.edit(edit => {
			edit.replace(cur_selection, text);
		});
	});



	context.subscriptions.push(disposable);
	context.subscriptions.push(convert);
}

// this method is called when your extension is deactivated
export function deactivate() {}

export class Convertor{
	columnCount : number = 0;
	headerBlock : string[] = [];
	bodys : string[] = [];
	columnLengths : number[] = [];
	tableBorder : string = "";
	validFormat : boolean = false;

    constructor(input_str: string){
		let inputLines : string[] = input_str.split('\n').map(x => x.trim()).filter(x => x.trim() !== "");
		this.validFormat = this.checkFormatAndSetTableBorder(inputLines);
		if(!this.validFormat){
			return;
		}
		const blockIterator = this.splitHeaderAndBody(inputLines);
		this.headerBlock = blockIterator.next().value as string[];
		this.bodys = blockIterator.next().value as string[];
		this.get_cell_of_line(this.bodys[1],1);
	}

	checkFormatAndSetTableBorder(inputLines : string[])
	{
		if(inputLines.length < 5){
			return false;
		}
		if(!inputLines[0].match(/=+( =+)+/)){
			return false;
		}
		this.tableBorder = inputLines[0];
		let beforeLine = this.tableBorder;
		let borderCount = 1;
		for(let i = 1; i < inputLines.length; i++){
			if(inputLines[i] === this.tableBorder){
				if(beforeLine === this.tableBorder){
					return false;
				}
				borderCount++;
			}
			if(i === inputLines.length - 1){
				if(inputLines[i] !== this.tableBorder){
					return false;
				}
			}
			beforeLine = inputLines[i];
		}
		if(borderCount !== 3){
			return false;
		}
		this.columnLengths = this.tableBorder.replace(/  +/g, " ").split(' ').map(x => x.length);
		return true;
	}

	*splitHeaderAndBody(inputLines : string[])
	{
		let header : string[] = [];
		let body : string[] = [];
		let borderCount = 0;
		for(let line of inputLines){
			if(line === this.tableBorder){
				borderCount++;
				continue;
			}
			switch(borderCount){
				case 1:
					header.push(line);
					break;
				case 2:
					body.push(line);
					break;
				default:
					continue;
			}
		}
		yield header;
		yield body;
	}

    get_record_list_from_line_str(line_str : string){
        let record : string[] = [];
        for(let i = 0; i < this.columnLengths.length; i++){
            //get_cell_of_lineを毎回呼び出すのは数えなおしが発生して少し無駄だが、PFM要求されるスクリプトでもないのでいいか
			record.push(this.get_cell_of_line(line_str, i).trim());
		}
		return record;
	}

    get_cell_of_line(line_str: string, column_index: number){
        let start = 0;
        for(let i = 0; i < column_index; i++){
			start += this.columnLengths[i];
			//count and add spaces after this column
			let j = start;
			while(this.tableBorder[++j] === " "){
				++start;
			}
		}
		let end = start + this.columnLengths[column_index];
		
		//utf-8にすると一文字3byte以上のケースで上手くいかないのでcp932にしておく
		let x = Buffer.from(line_str, 'ascii');
		let y = Buffer.from(line_str, 'ascii').slice(start, end);
		let z = Buffer.from(line_str, 'ascii').slice(start, end).toString('utf-8');
		return Buffer.from(line_str).slice(start, end).toString('utf-8');
	}

	/*
    get_csv_records(){
        header = self.get_record_list_from_line_str(this.headerBlock[1])
        bodys = [self.get_record_list_from_line_str(x) for x in this.bodys]

        yield header
        # 複数行のレコードをマージする
        # 逆順に見ていくことでいい感じにやる
        # 一番左側が空かどうかで見る
        result_bodys = []
        one_line_buffer = []
        for body in reversed(bodys):
            one_line_buffer.insert(0, body)
            if(body[0] == ""):
                continue
            else:
                result_bodys.insert(0, self.combine_buffer(one_line_buffer))
                one_line_buffer = []
        for result_body in result_bodys:
			yield result_body
	}

    combine_buffer(one_line_buffer){
        # 連続するレコードを一つのレコードに変換する。
        if len(one_line_buffer) == 0:
            return []
        if len(one_line_buffer) == 1:
            return one_line_buffer[0]
        records = []
        for record in one_line_buffer:
            records.append(list(map(lambda x: "| " + x, record)))
        result = []
        for i in range(len(records[0])):
            # 組み込みだけで行いたいのでreduceを使っていない
            i_values = []
            for record in records:
                i_values.append(record[i])
            result.append("\n".join(i_values))
		return result
	}

    output_csv_table(){
	}
	*/
}