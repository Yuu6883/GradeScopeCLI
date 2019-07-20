const https = require("https");
const qs = require("querystring");
const Cookie = require("cookie");
const chalk = require("chalk").default;
const { createGunzip } = require("zlib");

const { JSDOM } = require("jsdom");
const { window } = new JSDOM();
const { document } = window;
global.document = document;

/** @type {JQueryStatic} */
const $ = require("jquery")(window);
const fs = require("fs");
const { EventEmitter } = require("events");

/** @typedef {{term:String,hw:String,name:String,fullName:String,path:String}} Course */
/** @typedef {{href:String,name:String,score:String,status:String,release:Date,due:Date,lateDue:Date}} Homework */

// Regex or constants for parsing
const AUTH_TOKEN_REGEX = /input type="hidden" name="authenticity_token" value="[0-9a-z\/A-Z+=]*"/;
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

const fillString = (s, l) => (s.length <= l) ? (s + " ".repeat(l - s.length)) 
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
const toRow = (...args) => {
    let line = chalk.whiteBright("┃");
    return line + args.join(line) + line;
}

const splitStirng = (string, size) => string.replace(/\n/g, "")
                                            .match(new RegExp(`.{1,${size}}`, "g"));

class GradeScope extends EventEmitter {

    constructor() {
        super();

        this.authToken = "";
        this.token = "";
        this.session = "";
        this.rememberMe = false;
        this.loggingOut = false;

        /** @type {Course[]} */
        this.courses = [];
        this.currentTerm = "";
        /** @type {Course} */
        this.currentCourse;
        /** @type {Homework} */
        this.currentHomework;
        /** @type {Homework[]} */
        this.homeworkList = [];
        /** @type {String[]} */
        this.passed = [];
        /** @type {String[]} */
        this.failed = [];
        this.init();
    }

    init() {
        if (fs.existsSync(__dirname + "/token.txt")) {
            this.token = fs.readFileSync(__dirname + "/token.txt", "utf-8");
            this.rememberMe = true;
        }
    }

    saveToken() {
        if (this.token) {
            fs.writeFileSync(__dirname + "/token.txt", this.token, "utf-8");
            this.emit("success", "Token Saved");
        }
    }

    /** headers wrapper */
    async headers() {
        if (!this.session && !this.token && !(await this.createSession())) return;

        return {
            "Accept": "text/html,application/xhtml+xml,application/xml;" + 
                      "q=0.9,image/webp,image/apng,*/*;q=0.8," + 
                      "application/signed-exchange;v=b3",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "en",
            "Cache-Control": "max-age=0",
            "Connection": "keep-alive",
            "Cookie": (this.session ? `_gradescope_session=` + 
                            `${encodeURIComponent(this.session)};` : "") + 
                      (this.token ? `signed_token=` + 
                            `${encodeURIComponent(this.token)}` : ""),
            "Host": "www.gradescope.com",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" + 
                          " AppleWebKit/537.36 (KHTML, like Gecko) " + 
                          "Chrome/75.0.3770.100 Safari/537.36"
        };
    }

    /** Creates a gradescope session */
    createSession() {
        return new Promise(resolve => {
            this.emit("req", "Creating Session");
            let req = https.get("https://www.gradescope.com/", res => {
                let cookiesArray = res.headers["set-cookie"] || [];
                let parsedCookies = Cookie.parse(cookiesArray.join(";"));

                req.abort();
                this.emit("res");
                if (!parsedCookies._gradescope_session) {
                    this.emit("error", "Failed to Create Session");
                    resolve(false);
                } else {
                    this.emit("success", "Session Created");
                    this.parsedCookies._gradescope_session;
                    resolve(true);
                }
            });
        })
    }

    /** Save session from a cookie string*/
    saveSession(req, res) {
        let cookiesArray = res.headers["set-cookie"] || [];
        let cookies = Cookie.parse(cookiesArray.join(";"));
        if (!cookies._gradescope_session) {
            req.abort();
            this.emit("warn", "Failed to Save Session");
        }
        this.session = cookies._gradescope_session || this.session;
    }

    getCRSFToken(){

        return new Promise(resolve => {

            this.emit("req", "Breaching UC Berkeley Firewall");

            let req = https.get("https://www.gradescope.com/", res => {
        
                let tempChunk = '';
                let found = false;
        
                this.saveSession(req, res);

                res.on("data", chunk => {
                    
                    let bigChungus = tempChunk + chunk;
                    let match = AUTH_TOKEN_REGEX.exec(bigChungus);
            
                    if (match && match[0]) {
                        this.authToken = match[0].split("\"")[5];
                        this.emit("success", "Firewall Breached");
                        found = true;
                        resolve(true);
                        req.abort();
                    } else {
                        tempChunk = chunk;
                    }
                });
            
                res.on("end", () => {
                    this.emit("res");
                    if (found) return;
                    this.emit("error", "Can not retrieve Authenticity Token to log in");
                    resolve(false);
                });
            });

            req.on("error", e => {
                this.emit("error", e);
                resolve(false);
            });
        });
    }

    /** 
     * Send request to gradescope with specific path, method, and payload
     * @param {"GET"|"POST"|"DELETE"|"PUT"} method 
     * @returns {Promise.<{res:Response,body:String}>}
     */
    async apiCall(path, method, form) {
        
        method = (method || "GET").toUpperCase();

        if (!(["GET", "POST", "PUT", "DELETE"].includes(method))) {
            this.emit("error", `Unknown request method: ${method}`);
            return {};
        }

        /** @type {https.RequestOptions} */
        let option = { 
            host: "gradescope.com", 
            method, path,
            headers: await this.headers()
        };

        if (!option.headers) return {};

        return await new Promise(resolve => {

            let formData;
            if (form) {
                option.headers["Content-Type"] = "application/x-www-form-urlencoded";
                formData = qs.stringify(form);
                option.headers["Content-Length"] = formData.length;
            }
           
            let req = https.request(option, res => {
                let buffers = [];
                this.saveSession(req, res);
                this.emit("res");
        
                if (res.headers["content-encoding"] === "gzip") {   
                    res.pipe(createGunzip()
                        .on("data", chunk => {
                            buffers.push(chunk.toString());
                        })
                        .on("end", () => {
                            resolve({ res, body: buffers.join("") });
                        })
                        .on("error", e => this.emit("error", e)));
                } else {
                    res.on("data", chunk => {
                            buffers.push(chunk);
                        })
                        .on("end", () => {
                            resolve({ res, body: buffers.join("") });
                        })
                        .on("error", e => this.emit("error", e));
                }
            });
        
            req.on('error', e => this.emit("error", e));
        
            if (formData) req.write(formData);
            req.end();
        });
    }

    async loginWithCredentials(email, password, rememberMe) {
        if (!email || !password) {
            this.emit("error", "Email or password can't be empty");
            return false;
        }

        if (!this.authToken) await this.getCRSFToken();
        if (!this.authToken) return false;

        let { res } = await this.apiCall("/login", "POST", {
            "utf8": "✓",
            "authenticity_token": this.authToken,
            "session[email]": email,
            "session[password]": password,
            "session[remember_me]": rememberMe ? 1 : 0,
            "commit": "Log In",
            "session[remember_me_sso]": 0
        });

        if (!res) return false;

        if (res.statusCode !== 302) {
            this.emit("error", "Invalid email/password combination");
            return false;
        }

        let cookies = Cookie.parse(res.headers["set-cookie"].join(";") || []);

        if (cookies.signed_token) {
            this.token = cookies.signed_token;
            this.rememberMe = rememberMe === true;
            this.saveToken();
            this.emit("success", "Logged In");
            return true;
        } else {
            this.emit("warn", "Failed to log in");
            return false;
        }
    }

    async logout(force) {
        if (force !== true && (this.rememberMe ||
             !this.token || this.loggingOut)) return false;

        this.loggingOut = true;
        this.emit("req", "Erasing Hacking Record");
        let { res } = await this.apiCall("/logout");
    
        if (res.statusCode === 302) {
    
            this.token = null;
            fs.unlinkSync(__dirname + "/token.txt");
            this.emit("success", `Successfully Erased Hacking Record`);
            return true;
    
        } else {
            this.emit("warn", `Failed to Erased Hacking Record: Status[${
                res.statusCode}]:${res.statusMessage}`);
            return false;
        }
    }
    
    async fetchAllCourses(force) {

        if (force !== true && this.courses.length) {
            return this.courses;
        }

        this.emit("req", "Fetching All Courses");

        let { res, body } = await this.apiCall();

        if (res.statusCode !== 200) {
            this.emit("error", `Failed to Fetch Courses: Status[` + 
                               `${res.statusCode}]:${res.statusMessage}`);
            return false;

        } else if (!body) {
    
            this.emit("warn", "Failed to Fetch Course");
            return false;
        } else {
            let courses = [];
            
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

            this.courses = courses;
    
            let infoMatch= /Bugsnag.user = {name: ".+", email: ".+"}/.exec(body);
            let info = {};
            if (infoMatch && infoMatch[0]) {
                try {
                    info = JSON.parse(infoMatch[0].slice(14)
                                                .replace("name", "\"name\"")
                                                .replace("email", "\"email\""));
                } catch (e) { this.emit("error", e) }
            }
            if (info.name) {
                let lastName = info.name.split(" ").slice(-1)[0];
                this.emit("success", `Welcome Back, ${lastName}`);
            }
    
            return true;
        }
    }

    /** @param {Course} course */
    async fetchOneCourse(course) {

        let year = ~~(/20\d{2}/.exec(course.term)[0]);
        if (!year) year = new Date().getFullYear();

        this.emit("req", `Fetching ${course.name}`);
        let { res, body } = await this.apiCall(course.path);

        if (res.statusCode !== 200) {
            this.emit("warn", `Failed to Fetch Courses: Status[` + 
                               `${res.statusCode}]:${res.statusMessage}`);
            return false;
        } else if (!body) {
    
            this.emit("warn", `Failed to Fetch Course ${course.name}`);
            return false;
            
        } else {
            this.currentCourse = course;
            this.homeworkList = [];
            let homeworkList = this.homeworkList;

            $(body).find("tbody").children().each(function() {
    
                let [href, name, score, status, release, due, lateDue] = 
                    $(this).children().map(function(index) {
                        if (!index) return [$(this).find("a").attr("href"),
                                            $(this).text().trim()];
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
                        this.emit("warn", `Failed to parse release date: ${release}`);
                        release = null;
                    }
                }
                
                if (!TIME_REGEX.test(due)) due = null;
                else {
                    try {
                        due = parseDue(year, due);
                    } catch (_) {
                        this.emit("warn", `Failed to parse due date: ${due}`);
                        due = null;
                    }
                }
    
                if (!TIME_REGEX.test(lateDue)) lateDue = null;
                else {
                    try {
                        lateDue = parseDue(year, lateDue);
                    } catch (_) {
                        this.emit("warn", `Failed to parse late due date: ${lateDue}`);
                        lateDue = null;
                    }
                }
                
                homeworkList.push({ href, name, score, status, release, due, lateDue });
            });
    
            homeworkList.sort((a, b) => (b.due || 0) - (a.due || 0));
    
            return true;
        }
    }

    /** @param {Homework} hw */
    async fetchHomework(hw) {
    
        this.emit("req", `Fetching ${this.currentCourse.name} ${hw.name}`);

        let { res, body } = await this.apiCall(hw.href);
    
        if (res.statusCode !== 200) {
            this.emit("warn", `Failed to Fetch Homework: Status[` + 
                    `${res.statusCode}]:${res.statusMessage}`);
            return false;
        } else if (!body) {
    
            this.emit("warn", `Failed to Fetch Homework ${this.currentHomework.name}`);
            return false;
        } else {
            
            this.currentHomework = hw;
    
            this.passed = $(body).find(".test-case.passed")
                            .map(function(){ return this.textContent }).toArray();
    
            this.failed = $(body).find(".test-case.failed")
                            .map(function(){ return this.textContent }).toArray();
    
            return true;
        }
    }

    getTerms() {
        return [...new Set(this.courses.map(c => c.term))];
    }

    /** @param {Homework} hw */
    formatHwAsRow(hw) {
        return toRow(fillString(hw.name||"", 12), 
                     fillString(hw.score||hw.status||"", 14),
                     fillString(dueString(hw.due, hw.lateDue).trim() ||
                                chalk.green("  "), 40));
    }

    tableTop(...args) {
        return "┏" + args.map(n => "━".repeat(n)).join("┳") + "┓";
    }

    tableMiddle(...args) {
        return "┣" + args.map(n => "━".repeat(n)).join("╋") + "┫";
    }

    tableBottom(...args) {
        return "┗" + args.map(n => "━".repeat(n)).join("┻") + "┛";
    }

    getQuestionTable(width) {
        let list = [];
        this.failed.forEach(failString => {
            list.push(splitStirng(failString, width - 2)
                                .map(s => toRow(chalk.redBright(fillString(s, width)))).join("\n  "));
        });
        this.passed.forEach(passString => {
            list.push(splitStirng(passString, width - 2)
                                .map(s => toRow(chalk.greenBright(fillString(s, width)))).join("\n  "));
        });
        return list;
    }

    get needToLogin() {
        return !this.token;
    }

    get termCourses() {
        return this.courses.filter(c => c.term == this.currentTerm);
    }

    createNewInstance() {
        return new GradeScope();
    }
}

module.exports = new GradeScope();