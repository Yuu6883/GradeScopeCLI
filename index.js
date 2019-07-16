const https = require("https");
const qs = require("querystring");
const chalk = require("chalk").default;
const Cookie = require("cookie");
const logger = require("./logger");
const readline = require('readline');
const pp = require("password-prompt");
const { createGunzip } = require("zlib");

const { JSDOM } = require("jsdom");
const { window } = new JSDOM();
const { document } = window;

global.document = document;
const $ = require("jquery")(window);

const fs = require("fs");

/** @type {import("readline").Interface} */
let rl;
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
/** @type {{term:String,hw:String,name:String,fullName:String,path:String}[]} */
let courses = [];

const rainbowDots = newline => (dot = setTimeout(() => {
    newline && process.stdout.write("\n");
    process.stdout.write(color("."));
    rainbowDots();
}, 50));

const clearRainbow = newline => {
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

const createRL = () => {
    rl && rl.close();
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.on("SIGINT", quit);
}

const closeRL = () => rl && rl.close();

const ask = msg => new Promise(resolve => {
    if (!rl) createRL();
    rl.question(msg, resolve);
});

const loginWithCredentials = async() => {

    createRL();
    let email = await ask("> Enter Email: ");
    closeRL();

    let password = await pp("> Enter Password: ", { method: "hide" }).catch(quit);
    
    createRL();
    rememberMe = await ask("> Remember Me (yes/no): ");
    rememberMe = rememberMe.toLowerCase().trim() === "yes";

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
        logger.warn("You probably left some hacking record last time." + 
                    " FBI is looking for you.");
    }
};

const updateCourses = async () => {
    logger.log("Fetching Course Data");
    rainbowDots();
    let { res, body } = await APICall();
    clearRainbow(true);
        
    if (res.statusCode !== 200) {
        crash(new Error(`Failed to Fetch Course Data: Status[` + 
                `${res.statusCode}]:${res.statusMessage}`));
    } else if (!body) {
        // fs.unlinkSync(__dirname + "/token.txt");
        logger.log("length" + res.headers["content-length"]);
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
                eval("info = " + infoMatch[0].slice(14));
            } catch (e) { logger.error(e) }
        }
        if (info.name) {
            let lastName = info.name.split(" ").slice(-1)[0];
            logger.log(`Welcome Back, ${lastName}`);
        }

        return false;
    }
};

const formatTerm = term => term.split(" ")[0].toUpperCase().slice(0, 2) + 
                            term.split(" ")[1].slice(-2);

const listCourses = () => {
    for (let course of courses) {
        console.log(`${formatTerm(course.term)} ${course.name}`);
    }
}

let loggingOut = false;
const logout = async () => {
    if (rememberMe || !token || loggingOut) return;
    loggingOut = true;
    logger.log("Erasing Hacking Record");
    rainbowDots();
    let { res } = await APICall("/logout")
                            .catch(e => crash(e));
    clearRainbow();
    if (res.statusCode !== 302) {
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
                    "https://github.com/Yuu6883/GradeScopeCLI/issues")} ` + 
                    `to improve your experience with this CLI`);
    process.exit(0);
}

const quit = async () => {
    console.log("");
    await logout();
    logger.exit("Bye");
    process.exit(0);
}

(async() => {

    logger.log("Breaching UC Berkeley Firewall");

    let needToBreach = !token;
    while (!token) token = await loginWithCredentials();

    logger.log(needToBreach ? "Firewall Breached" : "Backdoor Connected");

    let failed = await updateCourses();

    while(failed) {
        token = await loginWithCredentials();
        failed = await updateCourses();
    }
    
    while (true) {
        let input = await ask("> ");
        if (input === "ls") {
            listCourses();
        }
    }
})();

process.on("SIGINT", quit);
process.on("uncaughtException", crash);
process.on("unhandledRejection", crash);