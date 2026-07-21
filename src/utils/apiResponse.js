
class ApiResponse {
  constructor(res, statusCode, data, message = 'Success') {
    return res.status(statusCode).json({
      status: 'success',
      message,
      data,
    });
  }
}

module.exports = ApiResponse;