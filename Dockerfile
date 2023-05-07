FROM node:18.16.0

WORKDIR /usr/src/app

COPY package*.json  ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 26192

CMD ["./bin/osham"]