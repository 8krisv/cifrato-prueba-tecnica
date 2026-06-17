###############################################################################
##
## Custom API error handling
##
## Copyright (C) 2024 Xresearch. All rights reserved.
##
###############################################################################

from flask import jsonify


class ApiError(Exception):
    """
    Custom exception that carries an HTTP status code, a message,
    an error_code, and any extra fields for the JSON response.
    
    Usage:
        raise ApiError(401, "Invalid API key", error_code="INVALID_API_KEY")
    """
    def __init__(self, status_code, message, error_code=None, **extras):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.error_code = error_code
        self.extras = extras


def register_error_handlers(app):
    """Register the ApiError handler on the Flask app."""
    
    @app.errorhandler(ApiError)
    def handle_api_error(error):
        response = {
            "success": False,
            "message": error.message,
        }
        if error.error_code:
            response["error_code"] = error.error_code
        
        # Include any extra fields 
        response.update(error.extras)
        
        return jsonify(response), error.status_code
