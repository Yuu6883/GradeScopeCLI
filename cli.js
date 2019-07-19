#!/usr/bin/env node

const chalk = require("chalk").default;
const term = require( 'terminal-kit' ).terminal;
const inquirer = require("inquirer");
const readline = require("readline");

const Rainbow = require("./rainbow");
const GS = require("./gradescope");

const SEP = () => new inquirer.Separator(chalk.blueBright("━━━━━━━━━━━━━━━━━━━━━━━"));
const BACK_SEP = () => [SEP(), "Back", SEP()];

GS.on("success", message => {
    Rainbow.stop();
    console.log(chalk.greenBright(message));
});

GS.on("req", message => {
    Rainbow.start();
    console.log(chalk.yellowBright(message));
});

GS.on("res", () => Rainbow.stop());

GS.on("warning", message => console.log(
    `[${chalk.yellowBright("Warning")}] ${message}`));

GS.on("error", error => {
    Rainbow.stop();
    crash(error);
});

/** @typedef {"start"|"term"|"course"|"hw"|"menu"|"question"} Command */
/** @type {Command[]} */
let commands = [];

/** @type {Object.<string,{choices:String[],message:String}>}*/
let handlers = {
    "start": () => ({ choices: ["Log In", "Quit"], message: "Menu" }),
    "menu": () => ({ choices:["View Courses", SEP(), "Log Out", "Quit"], 
              message: "Menu" }),
    "term": () => ({ choices: [SEP(), ...GS.getTerms(), ...BACK_SEP()], 
              message: "Choose a Term: " }),

    "course": () => ({ choices: [SEP(), ...GS.termCourses.map(c => c.name), ...BACK_SEP()],
                message: `${GS.currentTerm} Courses: ` }),
    "hw": () => ({ choices: [new inquirer.Separator(chalk.whiteBright(GS.tableTop(12, 14, 30))),
                            ...GS.homeworkList.map(h => ({ name: GS.formatHwAsRow(h), 
                                                    value: h,
                                                }))
                                                .reduce((prev, curr) => {
                                                    prev.length ? prev.push(new inquirer.Separator(
                                                                                chalk.whiteBright(GS.tableMiddle(12, 14, 30))), curr)
                                                                : prev.push(curr);
                                                    return prev;
                                                }, []),
                            new inquirer.Separator(chalk.whiteBright(GS.tableBottom(12, 14, 30))), "Back"], 
            message: `${GS.currentCourse.name}: ${GS.currentCourse.fullName}`}),
    "question": () => ({ choices: [...GS.failed.map(s => chalk.redBright(s)), 
                            ...GS.passed.map(s => chalk.greenBright(s)),
                            ...BACK_SEP()],
                  message: `${GS.currentHomework.name}`}),
    "default": () => ({ choices:["Quit"], message:"" }),
}

/** @type {Object.<string, Function} */
const actions = {
    "Log In": async () => {
        if (GS.needToLogin) {
            let { email, password, rememberMe } = await promptCredentials();
            eraseLines(3);
            let success = await GS.loginWithCredentials(email, password, rememberMe);
            if (!success) return "start";
        }
        if (await GS.fetchAllCourses(true)) return "menu";
    },
    "Log Out": async () => (await GS.logout(true)) && "start",
    "Quit": () => quit(),
    "View Courses": () => "term",
    "Back": () => {},
};

/** @type {Object.<string, Function} */
const specialActions = {
    "term": async arg => {
        GS.currentTerm = arg;
        return "course";
    },
    "course": async arg => {
        let course = GS.courses.find(c => c.name == arg);
        if (!course) {
            crash(`Can't find course ${arg}`);
            return "course";
        } else {
            return (await GS.fetchOneCourse(course)) && "hw";
        }
    },
    "hw": async arg => {
        if (arg.href) {
            return (await GS.fetchHomework(arg)) && "question";
        } else {
            await promptInfo(arg.name);
            return "hw";
        }
    }
}

const eraseLines = n => {
    readline.moveCursor(process.stdout, 0, -n);
    readline.clearScreenDown(process.stdout);
}

const promptAction = async () => {

    let commandString = commands.pop() || "start";

    let { choices, message } = (handlers[commandString] || handlers["default"])();

    let { result } = await inquirer.prompt({
        type: "list",
        name: "result",
        choices, message,
        prefix: ""
    });

    readline.moveCursor(process.stdout, 0, -1);
    readline.clearLine(process.stdout);

    /** @type {Command} */
    let nextCommand;
    if ((typeof result === "string") && actions[result]) {
        nextCommand = await actions[result]();
    } else {
        nextCommand = await specialActions[commandString](result);
    }

    if (nextCommand) {
        if (nextCommand === "start") commands = [];
        else commands.push(commandString, nextCommand);
    }
}

const promptCredentials = () => inquirer.prompt([
    {
        type: "input",
        message: "Enter Email: ",
        name: "email",
        prefix: "",
        validate: value => !value ? "Email Can't be Empty!" : true,
    },
    {
        type: "password",
        message: "Enter Password: ",
        name: "password",
        prefix: "",
        mask: "*",
        validate: value => !value ? "Password Can't be Empty!" : true
    },
    {
        type: "list",
        message: "Remember Me",
        name: "rememberMe",
        choices: ["Yes", "No"],
        filter: value => value === "Yes"
    }
]);

const promptInfo = info => inquirer.prompt([
    {
        name: "F",
        prefix: "",
        type: "list",
        message: `${info} has no further information`,
        choices: ["Ok..."]
    }
]);

const crash = e => {
    console.error(chalk.redBright(String(e.stack || e)));
    console.log(`Bitconnect Generator Has Crashed.\n` + 
                `Please report issue at ${chalk.yellowBright(
                    "https://github.com/Yuu6883/GradeScopeCLI/issues")}`);
    process.exit(1);
}

const quit = async () => {
    await GS.logout();
    // console.clear();
    console.log(chalk.magentaBright("Bye"));
    process.exit(0);
}

(async() => {

    console.clear();

    await term.drawImage(__dirname + "/icon.png");

    while(true) await promptAction();

})();

process.on("SIGINT", quit);
process.on("uncaughtException", crash);
process.on("unhandledRejection", crash);