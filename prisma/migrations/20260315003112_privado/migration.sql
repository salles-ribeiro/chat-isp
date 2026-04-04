-- CreateTable
CREATE TABLE "conversas_privadas" (
    "id" SERIAL NOT NULL,
    "chave" TEXT NOT NULL,
    "participante1" TEXT NOT NULL,
    "participante2" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversas_privadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_privadas" (
    "id" SERIAL NOT NULL,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversaId" INTEGER NOT NULL,

    CONSTRAINT "mensagens_privadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversas_privadas_chave_key" ON "conversas_privadas"("chave");

-- CreateIndex
CREATE INDEX "mensagens_privadas_conversaId_criadaEm_idx" ON "mensagens_privadas"("conversaId", "criadaEm");

-- AddForeignKey
ALTER TABLE "mensagens_privadas" ADD CONSTRAINT "mensagens_privadas_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "conversas_privadas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
