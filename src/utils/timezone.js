/**
 * Timezone Utility for Indian Standard Time (IST = UTC+5:30)
 * All timestamps in the app should use IST
 */

// IST Offset: UTC+5:30 = 5 hours 30 minutes ahead of UTC
const IST_OFFSET_MS = (5 * 60 * 60 + 30 * 60) * 1000; // 19800000 ms

/**
 * Get current time in IST
 * @returns {Date} Current time in Indian Standard Time
 *
 * Example:
 * const now = getNowIST();
 * // This gives you current time in IST, not UTC
 */
function getNowIST() {
    const utcNow = new Date();
    // Convert UTC to IST by adding offset
    // The returned Date object still uses UTC internally,
    // but when displayed/stored, it represents IST time
    const istTime = new Date(utcNow.getTime() + IST_OFFSET_MS);
    return istTime;
}

/**
 * Get future date in IST
 * @param {number} days - Number of days to add
 * @returns {Date} Future date in Indian Standard Time
 *
 * Example:
 * const trialEndsAt = getFutureDateIST(14);
 * // Trial ends 14 days from now (in IST)
 */
function getFutureDateIST(days) {
    const now = getNowIST();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    return new Date(now.getTime() + days * MS_PER_DAY);
}

/**
 * Get OTP expiry time (future time in IST)
 * @param {number} expiresInMinutes - Minutes until expiry (default: 10)
 * @returns {Date} OTP expiry time in IST
 *
 * Example:
 * const expiresAt = getOTPExpiryIST(10);
 * // OTP expires in 10 minutes from now (in IST)
 */
function getOTPExpiryIST(expiresInMinutes = 10) {
    const now = getNowIST();
    return new Date(now.getTime() + expiresInMinutes * 60 * 1000);
}

/**
 * Convert any UTC date to IST
 * @param {Date} utcDate - UTC date to convert
 * @returns {Date} Same moment in IST representation
 *
 * Example:
 * const istDate = convertUTCToIST(new Date());
 */
function convertUTCToIST(utcDate) {
    if (!utcDate) return null;
    return new Date(utcDate.getTime() + IST_OFFSET_MS);
}

/**
 * Format IST date for display
 * @param {Date} istDate - IST date to format
 * @returns {string} Formatted date string (YYYY-MM-DD HH:MM:SS IST)
 *
 * Example:
 * const formatted = formatIST(getNowIST());
 * // Output: "2026-06-29 15:45:30 IST"
 */
function formatIST(istDate) {
    if (!istDate) return null;

    const year = istDate.getFullYear();
    const month = String(istDate.getMonth() + 1).padStart(2, '0');
    const date = String(istDate.getDate()).padStart(2, '0');
    const hours = String(istDate.getHours()).padStart(2, '0');
    const minutes = String(istDate.getMinutes()).padStart(2, '0');
    const seconds = String(istDate.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${date} ${hours}:${minutes}:${seconds} IST`;
}

/**
 * Get days remaining until a future date (in IST)
 * @param {Date} futureDate - The future date in IST
 * @returns {number} Number of days remaining (0 if past)
 *
 * Example:
 * const daysLeft = getDaysRemainingIST(trialEndsAt);
 */
function getDaysRemainingIST(futureDate) {
    if (!futureDate) return 0;

    const now = getNowIST();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const daysLeft = Math.ceil((futureDate.getTime() - now.getTime()) / MS_PER_DAY);

    return Math.max(0, daysLeft);
}

/**
 * Check if a date has passed (in IST context)
 * @param {Date} date - Date to check
 * @returns {boolean} True if date is in the past
 *
 * Example:
 * if (isDatePastIST(trialEndsAt)) {
 *   // Trial has expired
 * }
 */
function isDatePastIST(date) {
    if (!date) return false;
    return date.getTime() < getNowIST().getTime();
}

/**
 * Get current period end date (one month from now in IST)
 * @returns {Date} One month from now in IST
 */
function getMonthlyPeriodEndIST() {
    const now = getNowIST();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return nextMonth;
}

/**
 * Get current period end date (one year from now in IST)
 * @returns {Date} One year from now in IST
 */
function getAnnualPeriodEndIST() {
    const now = getNowIST();
    const nextYear = new Date(now);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    return nextYear;
}

module.exports = {
    getNowIST,
    getFutureDateIST,
    getOTPExpiryIST,
    convertUTCToIST,
    formatIST,
    getDaysRemainingIST,
    isDatePastIST,
    getMonthlyPeriodEndIST,
    getAnnualPeriodEndIST,
    IST_OFFSET_MS,
};
