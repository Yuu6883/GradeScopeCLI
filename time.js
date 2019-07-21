const SEC = 1000;
const MIN = 60 * SEC;
const HR = 60 * MIN;
const DAY = 24 * HR;
const WK = 7 * DAY;
const MTH = 30 * DAY;
const YR = 365 * DAY;

module.exports = {
    /** @param {Date} time */
    timeString: time => {
        if (!(time instanceof Date)) return "";
        let delta = new Date() - time;
        let abs = Math.abs(delta);
        let string = "";
        if (abs < MIN) {
            string = "less than a minute";
        } else if (abs < HR) {
            let m = Math.round(abs / MIN);
            string = m + " minute" + (m > 1 ? "s" : "");
        } else if (abs < DAY) {
            let h = Math.round(abs / HR);
            string = h + " hour" + (h > 1 ? "s" : "");
        } else if (abs < WK) {
            let t = Math.round(abs / DAY);
            string = t + " day" + (t > 1 ? "s" : "");
        } else if (abs < MTH) {
            let t = Math.round(abs / WK);
            string = t + " week" + (t > 1 ? "s" : "");
        } else if (abs < YR) {
            let t = Math.round(abs / MTH);
            string = t + " month" + (t > 1 ? "s" : "");
        } else {
            let t = Math.round(abs / YR);
            string = t + " year" + (t > 1 ? "s" : "");
        }
        return delta <= 0 ? ("in " + string) : (string + " ago");
    }
}