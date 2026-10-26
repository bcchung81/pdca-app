import Link from "next/link";

/** 없는 화면·볼 수 없는 자료(권한 밖 보고서 등) */
export default function NotFound() {
  return (
    <main className="flex grow flex-col items-start gap-3 px-8 pt-10">
      <h1 className="font-serif text-title font-bold text-navy">찾을 수 없습니다</h1>
      <p className="max-w-[560px] text-sm leading-6 text-muted-2">주소가 바뀌었거나, 볼 수 있는 권한이 없는 자료입니다. 부서 담당자는 자기 부서 과제와 보고서만 볼 수 있습니다.</p>
      <Link href="/" className="flex h-9 items-center rounded-md bg-navy px-4 text-sm font-semibold text-white no-underline">
        첫 화면으로
      </Link>
    </main>
  );
}
