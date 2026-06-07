FROM node:20

RUN apt-get update && apt-get install -y git

WORKDIR /home/app

COPY main.sh main.sh
COPY script.js script.js
COPY package*.json ./

RUN npm install

RUN chmod +x main.sh
RUN chmod +x script.js

ENTRYPOINT [ "/home/app/main.sh" ]
