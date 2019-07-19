const chalk = require("chalk");
const readline = require("readline");

let dot;
let index = 0;
let color = msg => [chalk.blue, chalk.blueBright, chalk.cyan, chalk.cyanBright,
                    chalk.green, chalk.greenBright, chalk.yellow, 
                    chalk.yellowBright, chalk.redBright, chalk.red, 
                    chalk.magenta, chalk.magentaBright][index](msg);

const start = () => (dot = setTimeout(() => {
    index++;
    if (index == 12) {
        readline.clearLine(process.stdout);
        readline.cursorTo(process.stdout, 0);
        index = 0;
    }
    process.stdout.write(color("."));
    start();
}, 100));

const stop = () => {
    if (dot) {
        readline.clearLine(process.stdout);
        readline.moveCursor(process.stdout, 0, -1);
        readline.clearLine(process.stdout);
        readline.cursorTo(process.stdout, 0);
        clearTimeout(dot);
        dot = null;
    } 
}

module.exports = { start, stop };