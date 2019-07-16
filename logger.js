let { logLevel } = require("./config.json");
const chalk = require("chalk").default;

const writeLog = (mode, msg) => {
    if (process.env.pm_id || process.env.pm_id === 0) {
        console.log(`[${chalk.cyan(`Process_${process.env.pm_id}`)}][${mode}] ${msg}`);
    } else {
        console.log(`[${mode}] ${msg}`);
    }
};

class Logger {

    static setLevel(level, ignoreLog) {
        if (Number.isInteger(level) && level >= 0 && level < 5) {
            logLevel = level;
        } else {
            logLevel = 2;
        }
        ignoreLog || Logger.log(`Log level set to ${logLevel}`);
    }

    static debug(msg) {
        if (logLevel < 1) {
            writeLog(chalk.green("Debug"), msg.toString());
        }
    }

    static verbose(msg) {
        if (logLevel < 2) {
            writeLog(chalk.yellow("Verbose"), msg.toString());
        }
    }

    static log(msg) {
        if (logLevel < 3) {
            writeLog(chalk.blueBright("Info"), msg.toString());
        }
    }

    static warn(msg) {
        if (logLevel < 4) {
            writeLog(chalk.red("Warn"), msg.toString());
        }
    }

    static error(msg) {
        if (msg instanceof Error) {
            writeLog(chalk.redBright("Error"), msg.name + ": " + msg.message);
            if (msg.stack && msg.stack.replace(new RegExp("\n", "g"), "").trim())
                writeLog(chalk.redBright("Stack"), msg.name + ": " + msg.message);
        } else if (msg instanceof String) {
            writeLog(chalk.redBright("Error"), msg);
        } else {
            writeLog(chalk.redBright("Error"), String(msg));
        }
    }

    static exit(msg) {
        writeLog(`${chalk.magentaBright("Exit")}`, msg || "Unknown Reason");
    }
}

Logger.setLevel(logLevel, true);

Logger.DEBUG = 0;
Logger.VERBOSE = 1;
Logger.LOG = 2;
Logger.WARN = 3;
Logger.ERROR = 4;

module.exports = Logger;