FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /app/data/assets && chown -R node:node /app/data
USER node
EXPOSE 4173
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:4173/api/health',{headers:{authorization:'Basic '+Buffer.from((process.env.SIGNAL_ADMIN_USERNAME||'naira-admin')+':'+process.env.SIGNAL_ADMIN_PASSWORD).toString('base64')}}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
