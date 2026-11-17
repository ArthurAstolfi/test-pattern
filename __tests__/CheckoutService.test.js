import { CheckoutService } from '../src/services/CheckoutService.js';
import { Item } from '../src/domain/Item.js';
import { Pedido } from '../src/domain/Pedido.js';
import { UserMother } from './builders/UserMother.js';
import { CarrinhoBuilder } from './builders/CarrinhoBuilder.js';

const CARTAO = '4111-1111-1111-1111';

describe('CheckoutService', () => {
    describe('quando o pagamento falha', () => {
        let carrinho;
        let gatewayStub;
        let repositoryDummy;
        let emailDummy;
        let checkoutService;

        beforeEach(() => {
            // Arrange
            carrinho = new CarrinhoBuilder().build();
            // Stub: apenas fornece uma resposta pré-definida
            gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: false }) };
            // Dummies: preenchem o construtor, não devem ser usados
            repositoryDummy = { salvar: jest.fn() };
            emailDummy = { enviarEmail: jest.fn() };
            checkoutService = new CheckoutService(gatewayStub, repositoryDummy, emailDummy);
        });

        it('deve retornar null (verificação de estado)', async () => {
            // Act
            const pedido = await checkoutService.processarPedido(carrinho, CARTAO);

            // Assert
            expect(pedido).toBeNull();
        });

        it('não deve salvar o pedido nem enviar e-mail', async () => {
            // Act
            await checkoutService.processarPedido(carrinho, CARTAO);

            // Assert
            expect(repositoryDummy.salvar).not.toHaveBeenCalled();
            expect(emailDummy.enviarEmail).not.toHaveBeenCalled();
        });
    });

    describe('quando um cliente Padrão finaliza a compra', () => {
        it('deve retornar o pedido salvo com o totalFinal sem desconto (verificação de estado)', async () => {
            // Arrange
            const carrinho = new CarrinhoBuilder()
                .comUser(UserMother.umUsuarioPadrao())
                .comItens([new Item('Livro', 50), new Item('Caneta', 30)])
                .build();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = {
                salvar: jest.fn().mockImplementation(async (pedido) =>
                    new Pedido(42, pedido.carrinho, pedido.totalFinal, pedido.status)),
            };
            const emailDummy = { enviarEmail: jest.fn().mockResolvedValue(undefined) };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailDummy);

            // Act
            const pedido = await checkoutService.processarPedido(carrinho, CARTAO);

            // Assert
            expect(pedido).not.toBeNull();
            expect(pedido.id).toBe(42);
            expect(pedido.totalFinal).toBe(80);
            expect(pedido.status).toBe('PROCESSADO');
        });
    });

    describe('quando um cliente Premium finaliza a compra', () => {
        let gatewayStub;
        let repositoryStub;
        let emailMock;
        let pedidoSalvo;
        let resultado;

        beforeEach(async () => {
            // Arrange
            const usuarioPremium = UserMother.umUsuarioPremium();
            const carrinho = new CarrinhoBuilder()
                .comUser(usuarioPremium)
                .comItens([new Item('Fone de Ouvido', 150), new Item('Capa', 50)]) // R$ 200,00
                .build();
            pedidoSalvo = new Pedido(123, carrinho, 180, 'PROCESSADO');

            // Stubs: controlam o fluxo, fornecendo respostas pré-definidas
            gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
            // Mock: queremos verificar SE e COMO foi chamado
            emailMock = { enviarEmail: jest.fn().mockResolvedValue(undefined) };

            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailMock);

            // Act
            resultado = await checkoutService.processarPedido(carrinho, CARTAO);
        });

        it('deve cobrar o valor com 10% de desconto no gateway', () => {
            // Assert (verificação de comportamento)
            expect(gatewayStub.cobrar).toHaveBeenCalledTimes(1);
            expect(gatewayStub.cobrar).toHaveBeenCalledWith(180, CARTAO);
        });

        it('deve enviar 1 e-mail de confirmação com os dados corretos', () => {
            // Assert (verificação de comportamento)
            expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
            expect(emailMock.enviarEmail).toHaveBeenCalledWith(
                'premium@email.com',
                'Seu Pedido foi Aprovado!',
                'Pedido 123 no valor de R$180'
            );
        });

        it('deve retornar o pedido salvo pelo repositório', () => {
            // Assert (verificação de estado)
            expect(resultado).toBe(pedidoSalvo);
        });
    });

    describe('quando o envio de e-mail falha', () => {
        it('não deve falhar o checkout e deve retornar o pedido salvo', async () => {
            // Arrange
            const carrinho = new CarrinhoBuilder().build();
            const pedidoSalvo = new Pedido(7, carrinho, 100, 'PROCESSADO');
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
            const emailStub = { enviarEmail: jest.fn().mockRejectedValue(new Error('SMTP fora do ar')) };
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailStub);

            // Act
            const pedido = await checkoutService.processarPedido(carrinho, CARTAO);

            // Assert
            expect(pedido).toBe(pedidoSalvo);
            expect(consoleSpy).toHaveBeenCalledWith('Falha ao enviar e-mail', 'SMTP fora do ar');

            consoleSpy.mockRestore();
        });
    });
});
