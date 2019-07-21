#!/usr/bin/env node

const chalk = require("chalk").default;
const term = require( 'terminal-kit' ).terminal;
const inquirer = require("inquirer");
const readline = require("readline");

const Rainbow = require("./rainbow");
const GS = require("./gradescope");
const Table = require("./table");
const Nav = require("./cli-nav");
const { timeString } = require("./time");

const Course = require("./course");
const Assignment = require("./assignment");

GS.on("success", message => {
    Rainbow.stop();
    console.log(chalk.greenBright(message));
});

GS.on("req", message => {
    Rainbow.start();
    console.log(chalk.yellowBright(message));
});

GS.on("res", () => Rainbow.stop());

GS.on("error", error => {
    Rainbow.stop();
    crash(error);
});

const LONG = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
const SEP = () => new inquirer.Separator(chalk.cyanBright(LONG));
const LIST = arr => [SEP(), ...arr, SEP(), "Back", SEP()];
const RE = arr => [SEP(), ...arr, SEP(), "Refresh", "Back", "Quit", SEP()];

/** @typedef {"start"|"term"|"course"|"hw"|"menu"|"question"} Command */
/** @type {Command[]} */
let commands = [];

/** @type {Object.<string,{choices:String[],message:String}>}*/
const handlers = {
    "start": () => [["Log In", "Quit"], "Menu"],
    "menu": () => [[SEP(), Nav.viewCourses, SEP(), "Log Out", "Quit", SEP()], 
                    `Menu ${chalk.gray(" (Updated " + timeString(Nav.lastUpdate) + ")")}`],
    "term": () => [LIST(Nav.terms), "Choose a Term: "],
    "course": () => [RE(Nav.termCourses), `${Nav.currentTerm} Courses: `],

    "hw": () => [Table.chooseHw(Nav.hwList),
                `${chalk.magentaBright(Nav.currCourse.name + ": " + Nav.currCourse.fullName)}  ` + 
                `${chalk.gray(" (Updated " + timeString(Nav.currCourse.lastUpdate) + ")")}`],

    "question": () => [Table.chooseQuestion([Nav.currHw.failed, Nav.currHw.passed], 
                                [chalk.redBright, chalk.greenBright]),
                        chalk.magentaBright(Nav.currHw.courseName + " " + 
                            Nav.currHw.name + " " + 
                            (Nav.currHw.score || Nav.currHw.status))],

    "default": () => [["Quit"], ""],
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

        let result = await GS.fetchAllCourses();
        if (result.courses) {
            Nav.courses = result.courses;
            Nav.lastUpdate = result.timestamp || Nav.lastUpdate;
            console.log(chalk.greenBright(`Welcome Back, ` + 
                        `${result.info.name.split(" ").slice(-1)[0]}`));
            return "menu";
        }
        return "start";
    },
    "Log Out": async () => (await GS.logout(true)) && "start",
    "Quit": () => quit(),
    "View Courses": () => "term",
    /** @param {Command} commandString */
    "Refresh": async commandString => {
        switch(commandString) {
            case "course":
                let r1 = await GS.fetchAllCourses(true);
                if (r1.courses) {
                    Nav.lastUpdate = r1.timestamp;
                    Nav.courses = r1.courses;
                    console.log(chalk.greenBright(`Courses Refreshed`));
                }
                break;
            case "hw":
                await GS.fetchOneCourse(Nav.currCourse, true);
                break;
            case "question":
                await GS.fetchAssignment(arg, true);
                break;
        }
        return commandString;
    },
    "Back": () => {},
};

/** @type {Object.<string, Function>} */
const specialActions = {

    "term": async arg => {

        Nav.currentTerm = arg;
        return "course";

    },

    "course": async arg => {

        if (!(arg instanceof Course)) {
            await showInfo(`${arg} has no further information`);
            return "course";
        } else {
            Nav.currCourse = arg;
            Nav.hwList = await GS.fetchOneCourse(arg);
            return Nav.hwList ? "hw" : "course";
        }

    },

    "hw": async arg => {

        if (!(arg instanceof Assignment) || !arg.path) {
            await showInfo(`${arg.name || arg} has no further information`);
            return "hw";
        } else {
            Nav.currHw = arg;
            return (await GS.fetchAssignment(arg)) ? "question" : "hw";
        }
    }
}

const eraseLines = n => {
    readline.moveCursor(process.stdout, 0, -n);
    readline.clearScreenDown(process.stdout);
}

const promptAction = async () => {

    let commandString = commands.pop() || "start";

    let [choices, message] = (handlers[commandString] || handlers["default"])();

    let { result } = await inquirer.prompt({
        type: "list",
        name: "result",
        choices, message,
        prefix: ""
    });

    eraseLines(1);

    /** @type {Command} */
    let nextCommand;
    if ((typeof result === "string") && actions[result]) {
        nextCommand = await actions[result](commandString);
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

const showInfo = info => inquirer.prompt([
    {
        name: "F",
        prefix: "",
        type: "list",
        message: info,
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
    console.log(chalk.magentaBright("Bye"));
    process.exit(0);
}

(async() => {

    console.clear();

    await term.drawImage(__dirname + "/icon.png");

    if (!GS.needToLogin) {
        await actions["Log In"]();
        commands.push("menu");
    }

    while(true) await promptAction();

})();

process.on("SIGINT", quit);
process.on("uncaughtException", crash);
process.on("unhandledRejection", crash);