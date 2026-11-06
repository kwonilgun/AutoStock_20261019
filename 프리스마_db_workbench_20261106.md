# Prisma 데이터베이스 조회 도구 (2026-11-06)

이 프로젝트의 Prisma 데이터베이스는 MySQL이 아니라 SQLite다. 데이터는 `prisma/dev.db` 파일 하나에 들어 있다. 연결 문자열은 `.env`의 `DATABASE_URL="file:./dev.db"`이며, 경로는 `prisma/schema.prisma` 기준이다.

MySQL Workbench로는 이 파일을 열 수 없다. SQLite용 조회 도구를 쓴다.

## Prisma Studio

Prisma에 기본으로 들어 있는 웹 화면이다. 별도 설치가 필요 없고, 테이블을 열어 행을 보고 수정할 수 있다. 스키마의 `User`, `Portfolio` 같은 모델을 그대로 테이블로 보여 준다.

프로젝트 폴더에서 실행한다.

```bash
npx prisma studio
```

브라우저에서 `http://localhost:5555`가 열린다.

## 데스크톱 앱

| 앱 | 특징 |
|---|---|
| DB Browser for SQLite | 무료. Workbench에 가장 가까운 전용 도구. `prisma/dev.db`를 직접 연다. |
| TablePlus | Mac에서 많이 씀. SQLite 포함 여러 DB. 무료 사용에 제한이 있다. |
| DBeaver | 무료. MySQL, SQLite, PostgreSQL을 한 앱에서 본다. |

파일을 열 때는 `prisma/dev.db`를 고르면 된다.

## 주의

개발 서버(`npm run dev`)가 `prisma/dev.db`를 쓰는 동안에도 조회는 된다. 앱에서 데이터를 고치고 있을 때 Studio나 다른 도구에서 동시에 쓰면 파일 잠금이 걸릴 수 있다.
