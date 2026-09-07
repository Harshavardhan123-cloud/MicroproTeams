/**
 * Utility functions to consistently format timestamps in Indian Standard Time (IST - Asia/Kolkata).
 */

export const formatISTTime = (dateInput?: string | number | Date | null): string => {
  if (!dateInput) return '';

  try {
    let dateObj: Date;

    if (typeof dateInput === 'string') {
      let str = dateInput.trim();
      // Replace space separator with T
      str = str.replace(' ', 'T');
      // If timestamp does not end with Z or timezone offset (+XX:XX or -XX:XX), append Z to force UTC parsing
      if (!str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
        str += 'Z';
      }
      dateObj = new Date(str);
    } else {
      dateObj = new Date(dateInput);
    }

    if (isNaN(dateObj.getTime())) return '';

    return dateObj.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (err) {
    console.error('formatISTTime error:', err);
    return '';
  }
};

export const formatISTDateTime = (dateInput?: string | number | Date | null): string => {
  if (!dateInput) return '';

  try {
    let dateObj: Date;

    if (typeof dateInput === 'string') {
      let str = dateInput.trim();
      str = str.replace(' ', 'T');
      if (!str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
        str += 'Z';
      }
      dateObj = new Date(str);
    } else {
      dateObj = new Date(dateInput);
    }

    if (isNaN(dateObj.getTime())) return '';

    return dateObj.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch (err) {
    console.error('formatISTDateTime error:', err);
    return '';
  }
};
