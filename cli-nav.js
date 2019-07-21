/**
 * Navigator for cli
 */
class Nav {

    constructor() {
        /** @type {import("./course")[]}*/
        this.courses = [];
        this.currentTerm = "";
        /** @type {import("./course")} */
        this.currCourse;
        /** @type {import("./assignment")}*/
        this.currHw;
        /** @type {Date} */
        this.lastUpdate;
    }

    get viewCourses() {
        return {
            name: `View Courses (total ${this.courses.length})`,
            value: "View Courses"
        }
    }

    get terms() {
        let dict = {};
        this.courses.forEach(c => {
            dict[c.term] = dict[c.term] ? (dict[c.term] + 1) : 1;
        });

        return Object.keys(dict).map(term => ({
            value: term,
            name: `${term} (${dict[term]} courses)`
        }));
    }

    get termCourses() {
        return this.courses.filter(c => c.term == this.currentTerm)
                           .map(c => ({
                               name: c.name,
                               value: c
                           }));
    }

    get hwList() {
        return this.currCourse.assignments;
    }
}

/**
 * @param {String} s 
 * @param {Number} l 
 */
const fillString = (s, l) => (s.length <= l) ? (s + " ".repeat(l - s.length)) 
                                             : s.slice(0, l - 3) + "...";


module.exports = new Nav();