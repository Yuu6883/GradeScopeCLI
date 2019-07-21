class Course {

    /**
     * 
     * @param {String} term 
     * @param {String} name 
     * @param {String} fullName 
     * @param {String} path 
     * @param {Number} hwCount
     */
    constructor(term, name, hwCount, fullName, path) {
        this.term = term || "";
        this.name = name || "";
        this.hwCount = hwCount || 0;
        this.fullName = fullName || "";
        this.path = path;
        
        /** @type {Date} */
        this.lastUpdate;
        /** @type {import("./assignment")[]} */
        this.assignments = [];
    }
}

module.exports = Course;