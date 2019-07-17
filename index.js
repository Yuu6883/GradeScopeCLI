const https = require("https");
const qs = require("querystring");
const chalk = require("chalk").default;
const Cookie = require("cookie");
const logger = require("./logger");
const term = require( 'terminal-kit' ).terminal;

const { createGunzip } = require("zlib");
const inquirer = require("inquirer");

const { JSDOM } = require("jsdom");
const { window } = new JSDOM();
const { document } = window;

global.document = document;
/** @type {JQueryStatic} */
const $ = require("jquery")(window);

const fs = require("fs");

let session;
let token;
let rememberMe;

try {
    token = fs.readFileSync(__dirname + "/token.txt", "utf-8");
    rememberMe = true;
} catch (e) {}
const saveToken = t => fs.writeFileSync(__dirname + "/token.txt", t, "utf-8");

let dot;
let index = 0;
let color = msg => [chalk.blue, chalk.blueBright, chalk.cyan, chalk.cyanBright,
                    chalk.green, chalk.greenBright, chalk.yellow, 
                    chalk.yellowBright, chalk.red, chalk.redBright, 
                    chalk.magenta, chalk.magentaBright][++index % 12](msg);

/** @typedef {{term:String,hw:String,name:String,fullName:String,path:String}} Course */
/** @typedef {{name:String,score:String,status:String,release:Date,due:Date,lateDue:Date}} Homework */

/** @type {Course[]} */
let courses = [];
/** @type {Course[]} */
let termCourses = [];
/** @type {Course} */
let currentCourse;
let currentTerm = "";
/** @type {Homework[]} */
let homeworkList = [];

const getTerms = () => [...new Set(courses.map(c => c.term))];

const rainbowDots = newline => (dot = setTimeout(() => {
    newline && process.stdout.write("\n");
    process.stdout.write(color("."));
    rainbowDots();
}, 50));

const clearRainbow = newline => {
    console.clear();
    if (dot) {
        newline && process.stdout.write("\n");
        clearTimeout(dot);
        dot = null;
    } 
}

const getCRSFToken = () => new Promise((resolve, reject) => {

    rainbowDots();

    let req = https.get("https://www.gradescope.com/", res => {

        let tempChunk = '';

        let cookiesArray = res.headers["set-cookie"];
        if (!cookiesArray || !cookiesArray.length) {
            req.abort();
            return reject("No Session Received");
        }
        let cookies = Cookie.parse(cookiesArray.join(";"));
        if (!cookies._gradescope_session) {
            req.abort();
            return reject("No Session Received");
        }
        
        session = cookies._gradescope_session;

        res.on("data", chunk => {

            let bigChungus = tempChunk + chunk;
            let match = /input type="hidden" name="authenticity_token" value="[0-9a-z\/A-Z+=]*"/.exec(bigChungus);
    
            if (match && match[0]) {
                req.abort();
                clearRainbow(true);
                resolve(match[0].split("\"")[5]);
            } else {
                tempChunk = chunk;
            }
        });
    
        res.on("end", () => {
            clearRainbow(true);
            reject("Can not find \"authenticity_token\"");
        });
    });
});

const Headers = () => ({
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9," + 
            "image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en",
    "Cache-Control": "max-age=0",
    "Connection": "keep-alive",
    "Cookie": (session ? `_gradescope_session=${encodeURIComponent(session)};` : "") + 
                (token ? `signed_token=${encodeURIComponent(token)}` : ""),
    "Host": "www.gradescope.com",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " + 
                    "(KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36"
});

/** 
 * @param {"GET"|"POST"|"DELETE"|"PUT"} method 
 * @returns {Promise.<{res:any,body:String}>}
 */
const APICall = (path, method, form) => new Promise((resolve, reject) => {
    method = (method || "GET").toUpperCase();
    
    if (!(["GET", "POST", "PUT", "DELETE"].includes(method))) {
        return crash(`Unknown request method: ${method}`);
    }

    /** @type {https.RequestOptions} */
    let option = { 
        host: "gradescope.com", 
        path,
        headers: Headers(), 
        method };
    let formData;

    if (form) {
        option.headers["Content-Type"] = "application/x-www-form-urlencoded";
        formData = qs.stringify(form);
        option.headers["Content-Length"] = formData.length;
    }
   
    let req = https.request(option, res => {
        let buffers = [];

        if (res.headers["set-cookie"] && 
            res.headers["set-cookie"].length) {

            session = Cookie.parse(res.headers["set-cookie"]
                        .join(";"))._gradescope_session || session;
        }

        let unzip = createGunzip();
        res.pipe(unzip);
            
        unzip
            .on("data", chunk => {
                buffers.push(chunk.toString());
            })
            .on("end", () => {
                resolve({ res, body: buffers.join("") });
            })
            .on("error", reject);
    });

    req.on('error', err => {
        crash(err);
    });

    if (formData) req.write(formData);
    req.end();
});

const loginWithCredentials = async() => {

    let result = await inquirer.prompt([{
        type: "input",
        name: "email",
        message: "Enter Email: ",
        prefix: ""
    },{
        type: "password",
        name: "password",
        mask: "*",
        message: "Enter Password: ",
        prefix: "",
        validate: string => {
            if (!string) return "Password should not be empty";
            return true;
        }
    }, {
        type: "list",
        name: "rememberMe",
        message: "Remember Me",
        prefix: "",
        choices: ["yes", "no"],
        filter: input => input === "yes"
    }]);

    let { email, password } = result;
    rememberMe = result.rememberMe;

    let CRSFToken = await getCRSFToken().catch(e => crash(e));
    logger.log(`Firewall is 50% down`);
    rainbowDots(true);

    let { res } = await APICall("/login", "POST", {
        "utf8": "✓",
        "authenticity_token": CRSFToken,
        "session[email]": email,
        "session[password]": password,
        "session[remember_me]": rememberMe ? 1 : 0,
        "commit": "Log In",
        "session[remember_me_sso]": 0
    });

    if (res.statusCode !== 302) {
        logger.error("Invalid email/password combination");
        return;
    }

    let t = Cookie.parse(res.headers["set-cookie"].join(";")).signed_token;
    clearRainbow();

    if (t) {
        rememberMe && saveToken(t);
        return t;
    } else {
        crash("No Token Received");
    }
};

const updateCourses = async () => {
    logger.log("Fetching Courses");
    rainbowDots();
    let { res, body } = await APICall();
    clearRainbow(true);
        
    if (res.statusCode !== 200) {
        crash(new Error(`Failed to Fetch Courses: Status[` + 
                `${res.statusCode}]:${res.statusMessage}`));
    } else if (!body) {
        
        // logger.log("length" + res.headers["content-length"]);
        // console.log(res.headers["set-cookie"]);

        logger.log("Failed to Fetch Course Data: it looks like" + 
        " Berkeley detected last backdoor, need to log-in again.");
        return true;
    } else {
        
        $(body).find(".courseList--term").each(function() {
            let term = $(this).text();
            $(this).next().find("a").each(function() {
                let path = this.href;
                let name = $(this).find(".courseBox--shortname").text();
                let hw = ~~$(this).find(".courseBox--assignments").text().split(" ")[0];
                let fullName = $(this).find(".courseBox--name").text();
                courses.push({ term, name, hw, fullName, path });
           });
        });

        let infoMatch= /Bugsnag.user = {name: ".+", email: ".+"}/.exec(body);
        let info = {};
        if (infoMatch && infoMatch[0]) {
            try {
                info = JSON.parse(infoMatch[0].slice(14)
                                            .replace("name", "\"name\"")
                                            .replace("email", "\"email\""));
            } catch (e) { logger.error(e) }
        }
        if (info.name) {
            let lastName = info.name.split(" ").slice(-1)[0];
            logger.log(`Welcome Back, ${lastName}`);
        }

        return false;
    }
};

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const MONTH_REGEX = /^[A-Z]{3} \d{2}$/i;
const TIME_REGEX = /[A-Z]{3} \d{2} AT ( |\d)\d:\d{2}(A|P)M$/i;

const parseDue = (year, due) => {
    let string = TIME_REGEX.exec(due)[0];
    let month = MONTHS.indexOf(string.slice(0, 3).toUpperCase());
    let date = ~~string.slice(4, 6);
    let hours = ~~string.slice(-7, -5) + 
                 (string.slice(-2, -1) === "P" ? 12 : 0);
    let minutes = ~~string.slice(-4, -2);
    return new Date(year, month, date, hours, minutes);
}

/** @param {Course} course */
const fetchCourse = async course => {

    currentCourse = course;

    let year = ~~(/20\d{2}/.exec(course.term)[0]);
    if (!year) year = new Date().getFullYear();

    logger.log(`Fetching ${course.name} Course Data`);
    rainbowDots();
    let { res, body } = await APICall(course.path);
    clearRainbow(true);

    if (res.statusCode !== 200) {
        crash(new Error(`Failed to Fetch Courses: Status[` + 
                `${res.statusCode}]:${res.statusMessage}`));
    } else if (!body) {

        logger.error("Failed to Fetch Course Data");
        return false;
        
    } else {

        $(body).find("tbody").children().each(function() {

            let [name, score, status, release, due, lateDue] = 
                $(this).children().map(function(index) {
                    if (!index) return this.textContent.trim();
                    else if (index === 1) {

                        let score = $(this).find(".submissionStatus--score").text();
                            return [score.replace(/\s/g, ""), 
                                    $(this).text().replace(score, "")];

                    } else {
                        return [$(this).find(".submissionTimeChart--releaseDate").text(),
                             ...$(this).find(".submissionTimeChart--dueDate")
                                       .map(function() { return this.textContent })];
                    }
                });

            if (!MONTH_REGEX.test(release)) release = null;
            else {
                try {

                    let month = MONTHS.indexOf(release.split(" ")[0].toUpperCase());
                    let date = ~~release.split(" ")[1];
                    release = new Date(year, month, date);

                } catch (_) { 
                    logger.error(`Failed to parse release date: ${release}`);
                    release = null;
                }
            }
            
            if (!TIME_REGEX.test(due)) due = null;
            else {
                try {
                    due = parseDue(year, due);
                } catch (_) {
                    logger.error(`Failed to parse due date: ${due}`);
                    due = null;
                }
            }

            if (!TIME_REGEX.test(lateDue)) lateDue = null;
            else {
                try {
                    lateDue = parseDue(year, lateDue);
                } catch (_) {
                    logger.error(`Failed to parse late due date: ${lateDue}`);
                    lateDue = null;
                }
            }
            
            homeworkList.push({ name, score, status, release, due, lateDue });
        });

        homeworkList.sort((a, b) => (b.due || 0) - (a.due || 0));

        return true;
    }
}
const SEP = () => new inquirer.Separator(chalk.blueBright("━━━━━━━━━━━━━━━━━━━━━━━"));
const BACK_SEP = () => [SEP(), "Back", SEP()];
/** @type {"start"|"term"|"course"|"hwlist"|"menu"|"hw"} */
let currentLevel = "start";
const promptAction = async () => {

    let choices = ["Quit"], message = "";

    switch (currentLevel) {

        case "menu":
            choices = ["View Courses", SEP(), "Log Out", "Quit"];
            message = "Menu";
            break;

        case "start":
            choices = ["Log In", "Quit"];
            message = "Menu";
            break;

        case "term":
            choices = [SEP(), ...getTerms(), ...BACK_SEP()];
            message = "Choose a Term: ";
            break;

        case "course":
            choices = [SEP(), ...termCourses.map(c => c.name), ...BACK_SEP()];
            message = `${currentTerm} Courses: `;
            break;

        case "hwlist":
            choices = homeworkList.map(h => ({ name: formatHwAsRow(h), 
                                                value: h }))
                                .concat(BACK_SEP());

            message = `${currentCourse.name}: ${currentCourse.fullName}`;
            break;         
    }

    let { result } = await inquirer.prompt({
        type: "list",
        name: "result",
        message,
        choices,
        prefix: ""
    });

    if (currentLevel !== "start") console.clear();

    switch (result) {

        case "Log In":
            await login();
            break;

        case "Log Out":
            await logout();
            break;

        case "Quit":
            await quit();
            break;
        
        case "View Courses":
            currentLevel = "term";
            break;

        case "Back":
            if (currentLevel === "term") {
                currentLevel = "menu";
            } else if (currentLevel === "course") {
                termCourses = [];
                currentLevel = "term";
            } else if (currentLevel === "hwlist") {
                currentCourse = null;
                homework = [];
                currentLevel = "course";
            }
            break;

        default:
            if (currentLevel === "term") {
                termCourses = courses.filter(c => c.term == result);
                currentLevel = "course";
                currentTerm = result;
            } else if (currentLevel === "course") {
                let course = courses.find(c => c.name == result);
                if (!course) {
                    crash(`Can't find course ${result}`);
                } else {
                    let success = await fetchCourse(course);
                    if (success) currentLevel = "hwlist";
                }
            } else if (currentLevel === "hwlist") {
                
            }
    }
}

const fillString = (s, l) => s.length <= l ? (s + " ".repeat(l - s.length)) 
                                           : s.slice(0, l - 3) + "...";

/** @param {Date} due */
const dueString = (due, lateDue) => {
    if (!(due instanceof Date)) return "";
    let delta = due - new Date();
    if (delta > 0) {
        if (delta > 24 * 60 * 60 * 1000) {
            if (delta < 3 * 24 * 60 * 60 * 1000) {
                return chalk.yellowBright(`Due in ` + 
                    `${(delta / (24 * 60 * 60 * 1000)).toFixed(0)} days ` +
                    `${(delta % (60 * 60 * 1000))} hours`);
            } else {
                return chalk.greenBright(`Due in ` + 
                    `${(delta / (24 * 60 * 60 * 1000)).toFixed(0)} days`);
            }
        } else if (delta > 60 * 60 * 1000) {
            if (delta < 3* 60 * 60 * 1000) {
                return chalk.keyword("orange")(`Due in ` +
                    `${(delta / (60 * 60 * 1000)).toFixed(0)} hours ` +
                    `${(delta % (60 * 1000).toFixed(0))} minutes`);
            } else {
                return chalk.keyword("orange")(`Due in ` +
                    `${(delta / (60 * 60 * 1000)).toFixed(0)} hours`);
            }
        } else if (delta > 60 * 1000) {
            return chalk.redBright(`Due in ` +
                    `${(delta / (60 * 1000)).toFixed(0)} minutes`);
        } else {
            return chalk.red(`Due in less than a minute`);
        }
    } else if (!(lateDue instanceof Date)) {
        return chalk.yellow("Already Due");
    } else {
        if (lateDue > new Date()) {
            return chalk.redBright("LATE ") + dueString(lateDue);
        } else return chalk.yellow("LATE Already Due");
    }
}

/** @param {Homework} hw */
const formatHwAsRow = hw => {
    return  `${fillString(hw.name||"", 12)}│` + 
            `${fillString(hw.score||hw.status||"", 14)}│` + 
            `${fillString(dueString(hw.due, hw.lateDue)||"", 40)}│`;
}

let loggedIn = false;
const login = async () => {

    let needToBreach = !token;

    if (needToBreach) logger.log("Breaching UC Berkeley Firewall");

    while (!token) token = await loginWithCredentials();

    let failed = await updateCourses();

    while(failed) {
        token = await loginWithCredentials();
        failed = await updateCourses();
    }

    loggedIn = true;
    currentLevel = "menu";
    console.clear();
}

let loggingOut = false;
const logout = async () => {
    if (rememberMe || !token || loggingOut) return;
    loggingOut = true;
    logger.log("Erasing Hacking Record");
    rainbowDots();
    let { res } = await APICall("/logout")
                            .catch(e => crash(e));
    clearRainbow(true);

    if (res.statusCode === 302) {

        token = null;
        loggedIn = false;
        currentLevel = "start";
        fs.unlinkSync(__dirname + "/token.txt");
        logger.log(`Successfully Erased Hacking Record`);

    } else {
        logger.warn(`Failed to Erased Hacking Record: Status[${
            res.statusCode}]:${res.statusMessage}`);
    }
}

const crash = e => {
    logger.error(e);
    logger.exit(`Bitconnect Generator Has Crashed. ` + 
                `Please report issue at ${chalk.yellowBright(
                    "https://github.com/Yuu6883/GradeScopeCLI/issues")}`);
    process.exit(1);
}

const quit = async () => {
    console.log("");
    await logout();
    logger.exit("Bye");
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