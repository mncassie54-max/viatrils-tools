# AI Prompthon 2026 - Leadership Final Evaluation

Viatris Korea 최종 심사용 웹앱. GitHub Pages는 화면을 배포하며, 평가 데이터는 별도의 Supabase DB에 저장합니다.

## 디자인 미리보기 모드 (DB 연결 전)
- GitHub Pages 배포 후 사이트 주소 끝에 `?preview=1`을 붙이면 샘플 프로젝트 4개가 표시됩니다.
- 각 평가 항목에서 1~5점을 선택하고 총점이 자동 계산되는 모습을 확인할 수 있습니다.
- **미리보기에서는 최종 제출 버튼이 비활성화되며, 실제 데이터는 저장되지 않습니다.**
- 일반 URL의 메인 화면에는 DB 연결 전 상태를 알리고 미리보기 페이지로 이동하는 링크가 나옵니다.
- UI에 "Leadership" 문구는 사용하지 않습니다.

## 기능
- 심사자별 무작위 개인 초대 링크 (48자리 토큰 / 서버에는 해시만 보관)
- 업무 개선 30점, 구현 완성도 30점, 실무 활용 가능성 25점, 창의성 15점
- 평가 항목별 1~5점, 환산 총점 자동 계산
- 심사자 한 명이 각 팀에 한 번씩 최종 제출 (중복/수정 방지)
- 관리자용 전체 제출률, 팀별 평균, 심사자별 평가 내용, CSV 저장
- 관리자 페이지에서 팀 및 심사위원 등록, 개인 링크 생성

## 1. Supabase 데이터베이스 연결
1. https://supabase.com/ 에서 신규 프로젝트를 생성합니다. 사내 데이터의 외부 저장 허용 정책을 확인하세요.
2. Supabase SQL Editor에서 schema.sql 파일 전체를 실행합니다.
3. Project URL과 공개용 anon/publishable key를 찾습니다.
4. config.js의 url 및 anonKey 자리에 그 값을 넣습니다. service_role key는 절대 웹 코드에 넣지 마세요.
5. 평가자 및 점수는 공개 GitHub 저장소가 아니라 Supabase에서만 저장됩니다.

## 2. GitHub Pages 배포
1. 이 브랜치의 PR을 main 브랜치에 병합합니다.
2. https://github.com/mncassie54-max/viatrils-tools/settings/pages 접속
3. GitHub Pages > Build and deployment > Deploy from a branch > main > /(root)로 활성화합니다. 기존 Pages 설정이 있다면 운영 중인 사이트와 충돌하지 않는지 확인하세요.
4. 배포될 웹앱 예상 주소: https://mncassie54-max.github.io/viatrils-tools/ai-prompthon/
5. 실제 활성화 전에는 해당 사이트가 열리지 않을 수 있습니다.

## 3. 관리자 계정 활성화
1. Supabase Authentication에서 Email/Magic Link를 활성화합니다.
2. Authentication > URL Configuration에 실제 배포된 사이트 URL과 관리 페이지 쿼리가 포함된 URL을 Redirect URL로 허용합니다.
3. 웹사이트의 '결과 대시보드'에서 관리용 이메일을 입력하고 이메일 로그인 링크를 클릭합니다.
4. Supabase Authentication > Users에 해당 이메일의 계정이 생기면 SQL Editor에서 다음 SQL을 실행합니다 (이메일은 반드시 본인 주소로 변경).

    insert into public.admin_users (user_id)
    select id from auth.users where email = 'YOUR_ADMIN_EMAIL@example.com'
    on conflict do nothing;

5. 관리자 페이지를 새로고침하고 팀과 심사위원을 등록합니다.

## 4. 심사 운영
1. 팀별 결과보고서 링크를 등록합니다. Google Drive 문서의 공유 권한은 별도로 관리해야 합니다.
2. 심사위원 이름을 등록한 뒤, 생성된 일회성 확인용 링크를 해당 심사위원에게 개별 전달합니다. 코드는 DB에 해시로만 저장되므로 화면을 닫으면 원문을 다시 볼 수 없습니다.
3. 심사위원은 4개 항목에 점수를 부여한 뒤 최종 제출합니다. 제출 후에는 수정할 수 없습니다.
4. 관리자는 최종 결과 대시보드에서 팀별 평균 점수 및 전체 평가표를 한 번에 확인하고 CSV로 다운로드합니다.
5. 데모 제출을 시험한 후 운영 전에 테스트 결과를 삭제하거나 별도 프로젝트를 사용하세요.

## 보안 유의사항
- 웹 화면의 코드 공개와 심사 점수 공개는 별개입니다. 평가 데이터는 Supabase 행 단위 보안(RLS)과 서버 함수로 제한합니다.
- 관리자 권한을 받은 계정만 모든 평가 데이터에 접근할 수 있습니다.
- 심사자 링크는 기밀 초대장처럼 취급하고, 스크린샷이나 외부 공개 문서에 노출하지 마세요.
- 환자/HCP 개인정보, 회사의 비공개 의료 데이터는 심사 설명이나 결과 링크에 입력하지 않는 것을 권장합니다.
- 외부 호스팅과 제3자 데이터 처리 사용 여부는 사내 IT/보안 정책에 따라 승인받아야 합니다.

## 파일
- index.html: 심사/운영자 UI
- app.js: API 연동, 점수 계산, 제출, 집계, CSV
- config.js: Supabase 공개 연결 설정
- schema.sql: DB, RLS, 심사/초대용 RPC

## 상태
현재 코드는 준비되어 있지만 Supabase 프로젝트, 배포 URL, 관리자 승인 설정은 완료 전입니다. 위 단계를 실제 수행해야 여러 심사자가 인터넷에서 결과를 공유할 수 있습니다.
