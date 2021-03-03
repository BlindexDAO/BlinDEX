FROM nikolaik/python-nodejs
workdir /vyper
RUN git clone https://github.com/ethereum/vyper.git
workdir /vyper/vyper
RUN make
RUN npm i -g truffle
RUN npm i -g truffle-hdwallet-provider