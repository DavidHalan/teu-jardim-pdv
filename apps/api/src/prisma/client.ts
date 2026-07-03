// Ponto único de acesso ao Prisma client gerado (fronteira de infra, ADR-0018).
// Fora de src/prisma, importar SEMPRE daqui — o boundary-lint (R-TS2) proíbe
// importar src/generated diretamente. Se o output do generator mudar, só este
// arquivo (e o PrismaService) mudam.
export * from '../generated/prisma/client';
