const https = require("https");
const qs = require("querystring");
const Cookie = require("cookie");
const { createGunzip } = require("zlib");
const chalk = require("chalk").default;

const { JSDOM } = require("jsdom");
const { window } = new JSDOM();
const { document } = window;
global.document = document;

/** @type {JQueryStatic} */
const $ = require("jquery")(window);
const fs = require("fs");
const { EventEmitter } = require("events");

const Course = require("./course");
const Assignment = require("./assignment");

class GradeScope extends EventEmitter {

    constructor() {

        super();

        this.authToken = "";
        this.token = "";
        this.session = "";
        this.rememberMe = false;
        this.loggingOut = false;

        this.tokenPath = __dirname + "/token.txt";
        this.cachePath = __dirname + "/cache.json";

        /** @type {{courses:Course[]}} */
        this.cache = JSON.parse(fs.readFileSync(this.cachePath));
        this.cache.courses = this.cache.courses || [];

        this.cacheLimitMB = 10;
        this.nocache = false;

        this.ignoreWarning = false;

        this.loadConfig();
        this.init();
    }

    loadConfig(){

    }

    setConfig(config) {

    }

    init() {
        if (fs.existsSync(this.tokenPath)) {
            this.token = fs.readFileSync(this.tokenPath, "utf-8");
            this.rememberMe = true;
        }
        if (!this.ignoreWarning) {
            this.on("warning", message => console.log(
                `[${chalk.yellowBright("Warning")}] ${message}`));
        }  
    }

    saveToken() {
        if (this.token) {
            fs.writeFileSync(this.tokenPath, this.token, "utf-8");
            this.emit("success", "Token Saved");
        }
    }

    saveCache() {
        if (fs.statSync(this.cachePath).size / 1000000.0 < this.cacheLimitMB) {
            fs.writeFileSync(this.cachePath, JSON.stringify(this.cache));
        } else {
            this.emit("warn", `Not enough space for cache. Current limit is ` + 
                                `${this.cacheLimitMB.toFixed(2)}MB`);
        }
    }

    clearCache(field) {
        if (!field || !this.cache[field]) this.cache = {};
        else delete this.cache[field];
        this.saveCache();
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
     * @param {Boolean} cache
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

                const end = () => resolve({ res, body: buffers.join("") });

                const error = e => this.emit("error", e);
        
                if (res.headers["content-encoding"] === "gzip") {   
                    res.pipe(createGunzip()
                        .on("data", chunk => {
                            buffers.push(chunk.toString());
                        })
                        .on("end", end)
                        .on("error", error));
                } else {
                    res.on("data", chunk => {
                            buffers.push(chunk);
                        })
                        .on("end", end)
                        .on("error", error);
                }
            });
        
            req.on('error', e => {
                this.emit("error", e);
                resolve();
            });
        
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
            fs.unlinkSync(this.tokenPath);
            this.clearCache();
            this.emit("success", `Successfully Erased Hacking Record`);
            return true;
    
        } else {
            this.emit("warn", `Failed to Erased Hacking Record: Status[${
                res.statusCode}]:${res.statusMessage}`);
            return false;
        }
    }
    
    /**
     * Fetch all courses (from API or cache)
     * @param {Boolean} force bypass cache
     * @returns {{courses: Course[], info: { name:String, email:String }, timestamp: Date}} courses and info
     */
    async fetchAllCourses(force) {

        this.emit("req", "Fetching All Courses");

        let { res, body } = await this.apiCall();

        if (res.statusCode !== 200) {
            this.emit("error", `Failed to Fetch Courses: Status[` + 
                               `${res.statusCode}]:${res.statusMessage}`);
            return;

        } else if (!body) {
    
            this.emit("warn", "Failed to Fetch Course");
            return;

        } else {
            let courses = [];
            
            $(body).find(".courseList--term").each(function() {
                let term = $(this).text();
                $(this).next().find("a").each(function() {
                    let path = this.href;
                    let name = $(this).find(".courseBox--shortname").text();
                    let hwCount = ~~$(this).find(".courseBox--assignments").text().split(" ")[0];
                    let fullName = $(this).find(".courseBox--name").text();
                    courses.push(new Course(term, name, hwCount, fullName, path));
               });
            });
    
            let infoMatch= /Bugsnag.user = {name: ".+", email: ".+"}/.exec(body);
            let info = {};
            if (infoMatch && infoMatch[0]) {
                try {
                    info = JSON.parse(infoMatch[0].slice(14)
                                                .replace("name", "\"name\"")
                                                .replace("email", "\"email\""));
                } catch (e) { this.emit("error", e) }
            }

            return {
                courses, info, timestamp: new Date()
            }
        }
    }

    /** 
     * Fetch a specific course
     * @param {Course} course 
     * @param {Boolean} force bypass cache
     */
    async fetchOneCourse(course, force) {

        if (!(course instanceof Course)) {
            this.emit("warn", "Not a Course instance passed to GradeScope");
            return false;
        }

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
            course.assignments = [];

            $(body).find("tbody").children().each(function() {
    
                let [path, name, score, status, release, due, lateDue] = 
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
                course.lastUpdate = new Date();
                course.assignments.push(new Assignment(course.name, name, path, score, status, 
                                                       release, due, lateDue));
            });
    
            course.assignments.sort((a, b) => (b.due || 0) - (a.due || 0));
            return true;
        }
    }

    /** 
     * @param {Assignment} hw 
     * @param {Boolean} force bypass cache
     */
    async fetchAssignment(hw, force) {
    
        this.emit("req", `Fetching ${hw.courseName} ${hw.name}`);

        let { res, body } = await this.apiCall(hw.path);
    
        if (res.statusCode !== 200) {
            this.emit("warn", `Failed to Fetch Assignment: Status[` + 
                    `${res.statusCode}]:${res.statusMessage}`);
            return false;
        } else if (!body) {
    
            this.emit("warn", `Failed to Fetch Assignment ${this.currentHomework.name}`);
            return false;
        } else {
            
            let passed = $(body).find(".test-case.passed")
                            .map(function(){ return this.textContent }).toArray();
    
            let failed = $(body).find(".test-case.failed")
                            .map(function(){ return this.textContent }).toArray();
    
            hw.lasteUpdate = new Date();
            hw.passed = passed;
            hw.failed = failed;
            return true;
        }
    }

    get needToLogin() {
        return !this.token;
    }

    notif(message) {
        this.emit("notif", { message, timestamp: new Date() });
    }
}

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

module.exports = new GradeScope();