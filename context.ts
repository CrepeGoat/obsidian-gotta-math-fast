import { EditorState, SelectionRange } from "@codemirror/state";

export class Context {
	state: EditorState;

	constructor(state: EditorState) {
		this.state = state;
	}

	private scanBounds(): ContextToken[] {
		let result: ContextToken[] = [];

		let i_doc = 0;
		while (true) {
			// store bounds stack at each requested position
			if (positions[i_pos] <= i_doc) {
				result[i_pos] = [
					...(positions[i_pos] < i_doc
						? bound_stack.slice(0, -1) // ignore last bound if position interrupts it
						: bound_stack),
				];
				// terminating condition
				i_pos++;
				if (i_pos >= positions.length) {
					break;
				}
			}
			// terminating condition
			if (i_doc >= this.state.doc.length) {
				break;
			}

			// scan for bounds (also increments i_doc)
			for (let bound of ["$$", "$", undefined]) {
				// terminating condition
				if (bound === undefined) {
					i_doc++;
					break;
				}

				if (
					this.state.doc.sliceString(i_doc, i_doc + bound.length) !==
					bound
				) {
					continue;
				}

				let last_bound = bound_stack.last()?.text(this.state);
				if (last_bound === bound) {
					bound_stack.pop();
				} else {
					bound_stack.push(
						new ContextToken(i_doc, i_doc + bound.length)
					);
				}

				// make sure not to interpret the same bound multiple times
				i_doc = i_doc + bound.length;
				break;
			}
		}

		return result;
	}

	private getMajorType(
		state: EditorState,
		bound_stack: ContextToken[]
	): MajorContextTypes {
		let result = MajorContextTypes.Text;
		for (let bound of bound_stack) {
			const text = bound.text(state);
			if (result === MajorContextTypes.Math && text === "\\text{") {
				result = MajorContextTypes.Text;
				continue;
			}
			if (
				result === MajorContextTypes.Text &&
				(text === "$$" || text === "$")
			) {
				result = MajorContextTypes.Math;
				continue;
			}
		}

		return result;
	}
}

class ContextToken {
	from: number;
	to: number;

	constructor(from: number, to: number) {
		this.from = from;
		this.to = to;
	}

	public text(state: EditorState): string {
		return state.doc.sliceString(this.from, this.to);
	}
}

export enum MajorContextTypes {
	Text,
	Math,
}
