const Sep = require("inquirer").Separator;
const chalk = require("chalk").default;
const WIDTH = require("terminal-kit").terminal.width;

const TABLE_COLOR = "cyanBright";
const colorSep = m => new Sep(chalk[TABLE_COLOR](m));

class Table {

    /** @param {import("./assignment")} hw */
    static formatAssignment(hw) {
        
        let dueStr = hw.dueString;
        let color = chalk[UrgencyToColor[dueStr.type]];

        return toRow(fillString(hw.name||"", 12), 
                     fillString(hw.score||hw.status||"", 14),
                     fillString(color(dueStr.message), 40));
    }

    static top(...args) {
        return colorSep("┏" + args.map(n => "━".repeat(n)).join("┳") + "┓");
    }

    static middle(...args) {
        return colorSep("┣" + args.map(n => "━".repeat(n)).join("╋") + "┫");
    }

    static bottom(...args) {
        return colorSep("┗" + args.map(n => "━".repeat(n)).join("┻") + "┛");
    }

    /**
     * @param {Number} width 
     * @param {Function} color color function from chalk
     */
    static splitRows(string, width, color) {
        return splitStirng(string, width - 2).map(r => {
            return toRow(color(fillString(r, width)));
        }).join("\n  ");
    }

    /**
     * @param {import("./assignment")[]} hwList 
     */
    static chooseHw(hwList) {

        return [Table.top(12, 14, 30),
                ...hwList.map(h => { 
                            return {
                                name: Table.formatAssignment(h),
                                value: h,
                            };
                        })
                        .reduce((prev, curr) => {
                            if (prev.length) {
                                prev.push(Table.middle(12, 14, 30));
                            }
                            prev.push(curr);
                            return prev;
                        }, []),
                Table.bottom(12, 14, 30), "Refresh", "Back", "Quit"];
    }

    /**
     * @param {String[][]} typeQuestions
     * @param {String[]} colors
     */
    static chooseQuestion(typeQuestions, colors) {

        colors = Array.isArray(colors) ? colors : [];
        let w = WIDTH - 6;

        let list = [Table.top(w)];

        typeQuestions.forEach((questions, index) => {
            let color = colors[index] || chalk.yellowBright;
            questions.forEach(question => {
                if (list.length > 1) list.push(Table.middle(w));
                list.push(Table.splitRows(question, w, color));
            });
        });

        list.push(Table.bottom(w), "Refresh", "Back", "Quit");

        return list;
    }
}

const UrgencyToColor = {
    "normal": "greenBright",
    "warn": "yellowBright",
    "urgent": "yellow",
    "danger": "redBright",
    "dead": "red"
};

/**
 * @param {String} s 
 * @param {Number} l 
 */
const fillString = (s, l) => (s.length <= l) ? (s + " ".repeat(l - s.length)) 
                                             : s.slice(0, l - 3) + "...";

/**
 * @param  {...String} args 
 */                                            
const toRow = (...args) => {
    let line = chalk[TABLE_COLOR]("┃");
    return line + args.join(line) + line;
}

/**
 * @param {String} string 
 * @param {Number} size 
 * @return {String[]}
 */
const splitStirng = (string, size) => string.replace(/\n/g, "")
                                            .match(new RegExp(`.{1,${size}}`, "g"));

module.exports = Table;