import { IncomingMessage, ServerResponse } from "http";

export function timeoutMiddleware(request: IncomingMessage, response: ServerResponse) {
    request.socket.setTimeout(this.options.timeout);
}