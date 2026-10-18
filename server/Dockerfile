# Imagen del servidor de radio del CAD ER:LC
# Uso:
#   docker build -t cad-radio .
#   docker run -d --restart unless-stopped -p 8787:8787 \
#     -e PORT=8787 \
#     -e TURN_URLS=turn:mi-servidor.com:3478 \
#     -e TURN_USERNAME=usuario \
#     -e TURN_CREDENTIAL=contraseña \
#     cad-radio

FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY signaling.js radio-server.js ./

ENV PORT=8787
EXPOSE 8787

CMD ["node", "signaling.js"]
