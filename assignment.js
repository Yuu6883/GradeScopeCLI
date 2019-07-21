class Assignment {

    /**
     * @param {String} courseName 
     * @param {String} name 
     * @param {String} path 
     * @param {String} score 
     * @param {String} status 
     * @param {Date} release 
     * @param {Date} due 
     * @param {Date} lateDue
     */
    constructor(courseName, name, path, score, status, 
                release, due, lateDue) {
        this.courseName = courseName;
        this.name = name;
        this.path = path;
        this.score = score;
        this.status = status;
        this.release = release;
        this.due = due;
        this.lateDue = lateDue;
        
        /** @type {Date} */
        this.lasteUpdate;

        /** @type {String[]} */
        this.passed = [];
        /** @type {String[]} */
        this.failed = [];
    }

    /** @param {String} value */
    set score(value) {
        this.actualScore = parseFloat(value.split("/")[0]);
        this.fullScore = parseFloat(value.split("/")[1]);
    }

    get score() {
        if (this.fullScore) return `${this.actualScore}/${this.fullScore}`;
        return this.actualScore;
    }

    get dueString() {
        return dueString(this.due, this.lateDue);
    }
    
}

/**
 * @return {{message:String,type:"normal"|"warn"|"urgent"|"danger"|"dead"}}
 */
const dueString = (due, lateDue) => {

    if (!(due instanceof Date)) return { message: "  ", type: "normal" };
    let delta = due - new Date();
    if (delta > 0) {
        if (delta > 24 * 60 * 60 * 1000) {
            if (delta < 3 * 24 * 60 * 60 * 1000) {
                return { 
                    message: `Due in ` +
                        `${(delta / (24 * 60 * 60 * 1000)).toFixed(0)} days ` +
                        `${(delta % (60 * 60 * 1000))} hours`,
                    type: "warn"
                };
            } else {
                return { 
                    message: `Due in ` +
                            `${(delta / (24 * 60 * 60 * 1000)).toFixed(0)} days`,
                    type: "normal"
                };
            }
        } else if (delta > 60 * 60 * 1000) {
            if (delta < 3* 60 * 60 * 1000) {
                return { 
                    message: `Due in ` +
                            `${(delta / (60 * 60 * 1000)).toFixed(0)} hours ` +
                            `${(delta % (60 * 1000).toFixed(0))} minutes`,
                    type: "urgent"
                };
            } else {
                return { 
                    message: `Due in ` +
                    `${(delta / (60 * 60 * 1000)).toFixed(0)} hours`,
                    type: "urgent"
                };
            }
        } else if (delta > 60 * 1000) {
            return { 
                    message: `Due in ` +
                        `${(delta / (60 * 1000)).toFixed(0)} minutes`,
                    type: "danger"
            };
        } else {
            return { 
                message: `Due in less than a minute`,
                type: "dead"
            };
        }
    } else if (!(lateDue instanceof Date)) {
        return { message: "Already Due", type: "warn" };
    } else {
        if (lateDue > new Date()) {
            let late = dueString(lateDue);
            return { message: "Late " +  late.message, type: late.type };
        } else return { message: "Late Already Due", type: "warn" };
    }
}

module.exports = Assignment;