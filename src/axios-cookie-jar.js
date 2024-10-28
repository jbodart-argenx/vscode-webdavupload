const axiosNative = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

// Create a new cookie jar
const jar = new CookieJar();

// Wrap the native axios instance with cookie support
const axios = wrapper(axiosNative.create({
    jar,
    withCredentials: true
}));

module.exports = { axios };
