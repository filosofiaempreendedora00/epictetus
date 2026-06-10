/** @type {import('next').NextConfig} */
const nextConfig = {
  // Liga source maps no bundle de produção pra que erros React (tipo o #185)
  // mostrem o stack real em vez de "ik / nf / nu" minificado. Custo: ~5MB
  // extras servidos por chunk, mas só carregados quando o DevTools tá aberto.
  productionBrowserSourceMaps: true,
};

export default nextConfig;
