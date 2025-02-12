FROM node:iron-slim

WORKDIR /usr/src/app

COPY package*.json  ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 26192

CMD ["./bin/osham"]