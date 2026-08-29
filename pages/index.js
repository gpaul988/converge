import dynamic from 'next/dynamic';
import Head from 'next/head';

const Converge = dynamic(() => import('../components/ConvergeCheckin'), { ssr: false });

export default function Home() {
  return (
    <>
      <Head>
        <title>Converge Check-in</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <Converge />
    </>
  );
}
