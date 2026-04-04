/*
  Warnings:

  - The primary key for the `conversas_privadas` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `chave` on the `conversas_privadas` table. All the data in the column will be lost.
  - You are about to drop the column `autor` on the `mensagens_privadas` table. All the data in the column will be lost.
  - Added the required column `autorCpf` to the `mensagens_privadas` table without a default value. This is not possible if the table is not empty.
  - Added the required column `autorNome` to the `mensagens_privadas` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "mensagens_privadas" DROP CONSTRAINT "mensagens_privadas_conversaId_fkey";

-- DropIndex
DROP INDEX "conversas_privadas_chave_key";

-- AlterTable
ALTER TABLE "canais" ADD COLUMN     "aberto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "titulo" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "conversas_privadas" DROP CONSTRAINT "conversas_privadas_pkey",
DROP COLUMN "chave",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "conversas_privadas_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "conversas_privadas_id_seq";

-- AlterTable
ALTER TABLE "mensagens" ADD COLUMN     "autorCpf" TEXT,
ADD COLUMN     "nomeArquivo" TEXT,
ADD COLUMN     "tipoArquivo" TEXT,
ADD COLUMN     "urlArquivo" TEXT,
ALTER COLUMN "texto" SET DEFAULT '';

-- AlterTable
ALTER TABLE "mensagens_privadas" DROP COLUMN "autor",
ADD COLUMN     "autorCpf" TEXT NOT NULL,
ADD COLUMN     "autorNome" TEXT NOT NULL,
ADD COLUMN     "nomeArquivo" TEXT,
ADD COLUMN     "tipoArquivo" TEXT,
ADD COLUMN     "urlArquivo" TEXT,
ALTER COLUMN "texto" SET DEFAULT '',
ALTER COLUMN "conversaId" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nomeExibicao" TEXT NOT NULL,
    "equipe" TEXT DEFAULT '',
    "senhaHash" TEXT NOT NULL,
    "avatar" TEXT,
    "admin" BOOLEAN NOT NULL DEFAULT false,
    "gestor" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membros_canal" (
    "cpf" TEXT NOT NULL,
    "canalSlug" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membros_canal_pkey" PRIMARY KEY ("cpf","canalSlug")
);

-- CreateTable
CREATE TABLE "ultima_visita" (
    "cpf" TEXT NOT NULL,
    "canalSlug" TEXT NOT NULL,
    "visitadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ultima_visita_pkey" PRIMARY KEY ("cpf","canalSlug")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_nomeExibicao_key" ON "usuarios"("nomeExibicao");

-- AddForeignKey
ALTER TABLE "membros_canal" ADD CONSTRAINT "membros_canal_cpf_fkey" FOREIGN KEY ("cpf") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membros_canal" ADD CONSTRAINT "membros_canal_canalSlug_fkey" FOREIGN KEY ("canalSlug") REFERENCES "canais"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_privadas" ADD CONSTRAINT "mensagens_privadas_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "conversas_privadas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
