FROM ubuntu:focal

RUN apt-get update
RUN apt-get install -y curl
RUN curl -sL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get upgrade -y
RUN apt-get install -y nodejs

RUN apt-get install git -y

WORKDIR /home/app

COPY .env .env
COPY package.json package-lock.json ./

RUN npm install

COPY main.sh script.js ./

RUN chmod +x main.sh script.js




ENTRYPOINT [ "/home/app/main.sh" ]