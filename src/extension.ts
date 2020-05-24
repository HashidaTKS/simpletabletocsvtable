// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Z_FILTERED } from 'zlib';
import * as iconvLite from 'iconv-lite';
import * as csvStringify from "csv-stringify/lib/sync";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "simpletabletocsvtable" is now active!');

	let convert = vscode.commands.registerCommand('simpletabletocsvtable.convert', () => {
		const editor = vscode.window.activeTextEditor;
		if (editor === undefined || editor === null) {
			vscode.window.showInformationMessage('Please select a simple table');
			return;
		}
		const doc = editor.document;
		const cur_selection = editor.selection;
		if (editor.selection.isEmpty) {
			vscode.window.showInformationMessage('Please select a simple table');
			return;
		}

		const text = doc.getText(cur_selection);
		const convertor = new Convertor(text);
		if (!convertor.isValidFormat()) {
			vscode.window.showErrorMessage('Invalid format');
			return;
		}
		editor.edit(edit => {
			edit.replace(cur_selection, convertor.getCsvTable());
		});
	});

	context.subscriptions.push(convert);
}

// this method is called when your extension is deactivated
export function deactivate() { }

export class Convertor {
	private validFormat: boolean = false;
	private headerStringArray: string[] = [];
	private bodyStringArray: string[] = [];
	private columnStartEndTable: any[] = [];
	private tableBorder: string = "";

	constructor(input_str: string) {
		let inputLines: string[] = input_str.split('\n').map(x => x.trim()).filter(x => x.trim() !== "");
		this.checkFormat(inputLines);
		if (!this.validFormat) {
			return;
		}
		this.tableBorder = inputLines[0];
		this.setHeaderAndBodyStringArrays(inputLines);
		this.setColumnStartEndTable();
	}

	public isValidFormat(){
		return this.validFormat;
	}

	private setColumnStartEndTable() {
		const columnLengthArray = this.tableBorder.replace(/  +/g, " ").split(' ').map(x => x.length);
		for (let columnIndex = 0; columnIndex < columnLengthArray.length; columnIndex++) {
			let start = 0;
			for (let i = 0; i < columnIndex; i++) {
				start += columnLengthArray[i];
				//count and add spaces after this column
				while (this.tableBorder.charAt(start) === " ") {
					start++;
				}
			}
			let end = start + columnLengthArray[columnIndex];
			this.columnStartEndTable.push({ "start": start, "end": end });
		}
	}

	private checkFormat(inputLines: string[]) {
		this.validFormat = false;
		if (inputLines.length < 5) {
			return;
		}
		if (!inputLines[0].match(/=+( =+)+/)) {
			return;
		}
		const tableBorder = inputLines[0];
		let beforeLine = tableBorder;
		let borderCount = 1;
		for (let i = 1; i < inputLines.length; i++) {
			if (inputLines[i] === tableBorder) {
				if (beforeLine === tableBorder) {
					return;
				}
				borderCount++;
			}
			if (i === inputLines.length - 1) {
				if (inputLines[i] !== tableBorder) {
					return;
				}
			}
			beforeLine = inputLines[i];
		}
		if (borderCount !== 3) {
			return;
		}
		this.validFormat = true;
	}

	private setHeaderAndBodyStringArrays(inputLines: string[]) {
		let borderCount = 0;
		for (const line of inputLines) {
			if (line === this.tableBorder) {
				borderCount++;
				continue;
			}
			switch (borderCount) {
				case 1:
					this.headerStringArray.push(line);
					break;
				case 2:
					this.bodyStringArray.push(line);
					break;
				default:
					continue;
			}
		}
	}

	private getRecordArrayFromLineStr(lineStr: string) {
		const record: string[] = [];
		for (let i = 0; i < this.columnStartEndTable.length; i++) {
			//blank cell is converted to single space cell
			record.push(this.getColumnValueOfLine(lineStr, i).trimRight().replace(/^\\$/, ' '));
		}
		return record;
	}

	private getColumnValueOfLine(lineStr: string, columnIndex: number) {
		const startEndObj = this.columnStartEndTable[columnIndex];
		const start = startEndObj["start"] as number;
		//used by slice(), so add 1
		let end = startEndObj["end"] as number + 1;

		//support japanese
		//regarding multibyte char as 2bytes
		//TODO: support other languages
		let encodedLine = iconvLite.encode(lineStr, "windows932");
		if ((columnIndex === this.columnStartEndTable.length - 1) && (encodedLine.length > end)) {
			//only at the last column, the value length can be over the border length 
			//because there is no column separater after the last column.
			end = encodedLine.length;
		}
		return iconvLite.decode(encodedLine.slice(start, end), "windows932");
	}

	private *getCsvRecords() {
		//header
		//not support multi line header
		yield this.getRecordArrayFromLineStr(this.headerStringArray[0]);
		
		//body
		const bodyRecordArray: [string[]] = [] as unknown as [string[]];
		for (const bodyStr of this.bodyStringArray) {
			bodyRecordArray.push(this.getRecordArrayFromLineStr(bodyStr));
		}

		const mergedRecordArray: [string[]] = [] as unknown as [string[]];
		let lineBuffer: [string[]] = [] as unknown as [string[]];
		for (const body of bodyRecordArray.reverse()) {
			lineBuffer.unshift(body);
			if (body[0] === "") {
				continue;
			}
			else {
				mergedRecordArray.unshift(this.mergeBuffer(lineBuffer));
				lineBuffer = [] as unknown as [string[]];
			}
		}
		for (const mergedRecord of mergedRecordArray) {
			yield mergedRecord;
		}
	}

	private mergeBuffer(lineBuffer: [string[]]) {
		if (!lineBuffer || !lineBuffer.length) {
			return [];
		}
		if (lineBuffer.length === 1) {
			return lineBuffer[0];
		}
		const records: [string[]] = [] as unknown as [string[]];
		for (const record of lineBuffer) {
			records.push(record.map(x => `| ${x}`));
		}
		const result: string[] = [];
		for (let i = 0; i < records[0].length; i++) {
			const i_values: string[] = [];
			for (const record of records) {
				i_values.push(record[i]);
			}
			result.push(i_values.join("\n"));
		}
		return result;
	}

	getCsvTable() {
		if(!this.isValidFormat()){
			return "";
		}
		let result: string = "";
		result += '.. csv-table::\n';
		result += '  :header-rows: 1\n';
		result += '  \n';

		for (const data of this.getCsvRecords()) {
			//add each record respectively in order to add left padding spaces.
			result += `  ${csvStringify([data], { header: false })}`;
		}
		return result;
	}
}