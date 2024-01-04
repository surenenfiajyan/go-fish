export default class GoFish {
	#newGameButtonEl = document.getElementById('newGameBtn');
	#difficultySelectEl = document.getElementById('difficultySelect');
	#opponentCardsEl = document.getElementById('opponentCards');
	#opponentFishesEl = document.getElementById('opponentFishes');
	#fullDeckEl = document.getElementById('fullDeck');
	#yourFishesEl = document.getElementById('yourFishes');
	#yourCardsEl = document.getElementById('yourCards');
	#popup = document.getElementById('popup');
	#minimumKnownYourCards = {};
	#minimumKnownOpponentCards = {};
	#possibleKnownCardsLeftInDeck = {};
	#difficulty = '';
	#turnOffEvents = false;
	#sound = new Audio('card.mp3');
	#firstTime = true;
	#yourTurn = false;
	#message = document.createElement('div');
	#yourInputReject = null;
	#cardNames = {
		'A': 'aces',
		'2': 'twos',
		'3': 'threes',
		'4': 'fours',
		'5': 'fives',
		'6': 'sixes',
		'7': 'sevens',
		'8': 'eights',
		'9': 'nines',
		'10': 'tens',
		'J': 'jacks',
		'Q': 'queens',
		'K': 'kings',
	};

	constructor() {
		this.#sound.load();
		this.#message.classList.add('message');
		const blocker = e => {
			if (this.#turnOffEvents) {
				e.preventDefault();
				e.stopPropagation();
			}
		};

		window.addEventListener('click', blocker, true);
		window.addEventListener('change', blocker, true);
		window.addEventListener('input', blocker, true);
		window.addEventListener('keydown', blocker, true);
		window.addEventListener('focus', blocker, true);
		window.addEventListener('mousedown', blocker, true);
		
		this.#newGameButtonEl.onclick = e => {
			this.#showDialog('Start a new game?', () => {
				this.newGame();
			}, () => {

			});
		};

		this.#difficultySelectEl.onchange = e => {
			this.#showDialog('The difficulty will be applied only in the next game, would you like to start a new game?', () => {
				this.newGame();
			}, () => {

			});
		};
	}

	async newGame() {
		if (this.#firstTime) {
			this.#firstTime = false;

			this.#showDialog('Welcome to Go Fish game!', () => {
				this.newGame();
			});

			return;
		}
		
		this.#yourInputReject?.('Started new game');
		this.#yourTurn = Math.random() < 0.5;
		this.#turnOffEvents = true;
		this.#difficulty = this.#difficultySelectEl.value;
		this.#minimumKnownYourCards = {
			'A': 0,
			'2': 0,
			'3': 0,
			'4': 0,
			'5': 0,
			'6': 0,
			'7': 0,
			'8': 0,
			'9': 0,
			'10': 0,
			'J': 0,
			'Q': 0,
			'K': 0,
		};

		this.#minimumKnownOpponentCards = structuredClone(this.#minimumKnownYourCards);
		this.#possibleKnownCardsLeftInDeck = Object.fromEntries(Object.entries(this.#minimumKnownOpponentCards).map(e => [e[0], 4]));
		this.#opponentFishesEl.innerHTML = this.#yourFishesEl.innerHTML = this.#yourCardsEl.innerHTML = this.#opponentCardsEl.innerHTML = '';

		const allCards = Object.keys(this.#minimumKnownYourCards).flatMap(level => [
			{type: 'hearts', level},
			{type: 'diamonds', level},
			{type: 'spades', level},
			{type: 'clubs', level}
		]);

		for (let i = 0; i < allCards.length; ++i) {
			const r = Math.floor(Math.random() * allCards.length);
			[allCards[i], allCards[r]] = [allCards[r], allCards[i]];
		}

		this.#fullDeckEl.innerHTML = allCards.map(x => `<div class="full-deck-card"><div class="card-back" data-type="${x.type}" data-level="${x.level}"></div></div>`).join('');
		
		for (let i = 0; i < 7; ++i) {
			const card = this.#pickCardFromDeck();
			await this.#addToCardsFromDeck(this.#yourCardsEl, card);
		}

		for (let i = 0; i < 7; ++i) {
			const card = this.#pickCardFromDeck();
			this.#minimumKnownOpponentCards[card.dataset.level]++;
			this.#possibleKnownCardsLeftInDeck[card.dataset.level]--;
			await this.#addToCardsFromDeck(this.#opponentCardsEl, card);
		}

		await this.#checkForCopleteBlocks();
		await this.#cleanupLeftovers();

		await this.#processTurn();
	}

	#showDialog(message, onAccept = null, onDecline = null) {
		this.#popup.returnValue = onDecline ? 'no' : 'yes';
		this.#popup.querySelector('.message').innerText = message;
		this.#popup.showModal();
		const [yesButton, noButton] = this.#popup.querySelectorAll('button');

		yesButton.innerText = onDecline ? 'Yes' : 'OK';
		noButton.style.display = onDecline ? '' : 'none';

		this.#popup.onclose = e => {
			if (e.target.returnValue === 'yes') {
				onAccept?.();
			} else {
				onDecline?.();
			}
		}
	}

	#pickCardFromDeck() {
		return this.#fullDeckEl.lastElementChild?.firstElementChild;
	}

	async #addToCardsFromDeck(cardsEl, card) {
		const duration = 150;
		const group = this.#getGroup(card.dataset.level, cardsEl);
		const deckBox = card.getBoundingClientRect();
		const groupBox = (cardsEl === this.#opponentCardsEl ? this.#opponentCardsEl : group).getBoundingClientRect();
		card.style.transition = `all linear ${duration}ms`;
		card.style.transform = 'translateY(-90%)';
		card.style.left = `${groupBox.x - deckBox.x}px`;
		card.style.top = `${groupBox.y - deckBox.y}px`;
		this.#makeSwipeSound();
		await this.#wait(duration);
		card.style.transition = card.style.left = card.style.top = card.style.transform = '';
		card.classList.replace('card-back', 'card');
		card.parentElement.classList.replace('full-deck-card', 'play-card');
		group.append(card.parentElement);
	}

	async #checkForCopleteBlocks() {
		for (const group of [...this.#yourCardsEl.querySelectorAll('.group:has(:nth-child(4))')]) {
			await this.#addToFish(group);
		}

		for (const group of [...this.#opponentCardsEl.querySelectorAll('.group:has(:nth-child(4))')]) {
			this.#possibleKnownCardsLeftInDeck[group.dataset.level] = 0;
			this.#minimumKnownOpponentCards[group.dataset.level] = 0;
			this.#minimumKnownYourCards[group.dataset.level] = 0;
			await this.#addToFish(group);
		}
	}

	async #addToFish(group) {
		const duration = 150;
		const your = this.#yourCardsEl.contains(group);
		const groupBox = (your ? group : this.#opponentCardsEl).getBoundingClientRect();
		const fishBox = (your ? this.#yourFishesEl : this.#opponentFishesEl).getBoundingClientRect();

		const [destinationX, destinationY] = your ? [fishBox.right - 100, fishBox.bottom] : [fishBox.left, fishBox.top];
		const dx = destinationX - groupBox.x;
		const dy = destinationY - groupBox.y;
		const cards = [...group.querySelectorAll('.card')];


		if (your) {
			for (const card of cards) {
				card.style.transition = `all linear ${duration}ms`;
				card.style.left = `${dx}px`;
				card.style.top = `${dy}px`;
				card.style.transform = 'translateY(-90%) rotate3d(1, 0, 1, 0deg)';
				await this.#wait(duration);
				this.#makeSwipeSound();
				card.classList.replace('card', 'card-back');
				card.style.left = card.style.top = '';
				card.parentElement.classList.replace('play-card', 'fish-card');
				this.#yourFishesEl.append(card.parentElement);
				await this.#wait(duration / 10);
				card.style.transform = '';
			}
		} else {
			for (const card of cards) {
				card.style.transition = `all linear ${duration}ms`;
				card.style.left = `${-dx}px`;
				card.style.top = `${-dy}px`;
				card.style.transform = 'translateY(-90%) rotate3d(1, 0, 1, 0deg)';
				card.classList.replace('card', 'card-back');
				card.parentElement.classList.replace('play-card', 'fish-card');
				this.#opponentFishesEl.append(card.parentElement);
				await this.#wait(duration);
				this.#makeSwipeSound();
				await this.#wait(duration / 10);
				card.style.transform = card.style.left = card.style.top = '';
			}
		}
	}

	#getGroup(level, cardsEl) {
		let group = cardsEl.querySelector(`[data-level="${level}"]`);

		if (!group) {
			group = document.createElement('div');
			group.classList.add('group');
			group.dataset.level = level;
			cardsEl.append(group);
		}

		return group;
	}

	#makeSwipeSound() {
		this.#sound.pause();
		this.#sound.currentTime = 0;
		this.#sound.play();
	}

	#wait(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	async #processTurn() {
		this.#turnOffEvents = true;

		const guess = await this.#waitForYourGuess();

		/*if (this.#yourTurn) {
		} else {

		}*/
		await this.#showMessage(`Have any ${this.#cardNames[guess]}?`, true)
		await this.#showMessage(`Have any ${this.#cardNames[guess]}?`, false)

		this.#processTurn();
	}

	#waitForYourGuess() {
		return new Promise((resolve, reject) => {
			this.#turnOffEvents = false;
			this.#yourInputReject = reject;

			this.#yourCardsEl.querySelectorAll('.group > :last-child .card').forEach(card => {
				this.#addCardClickListener(card, c => {
					this.#yourInputReject = null;
					this.#cleanupLeftovers();
					this.#turnOffEvents = true;
					resolve(c.dataset.level);
				});
			});
		});
	}

	#addCardClickListener(card, callback) {
		card.tabIndex = 0;
		card.style.cursor = 'pointer';
		card.onclick = () => callback(card);
		card.onkeydown = e => {
			if (e.key === "Enter") {
				callback(card);
			}
		};
	}

	async #showMessage(message, your, duration = 2000) {
		this.#message.innerText = message;
		(your ? this.#yourCardsEl : this.#opponentCardsEl).append(this.#message);
		await this.#wait(duration);
		this.#message.remove();
	}

	async #cleanupLeftovers() {
		await this.#wait(150);
		document.querySelectorAll('.card, .card-back').forEach(card => {
			card.style.transition = card.style.cursor = '';
			card.removeAttribute('tabindex');
			card.onclick = card.onkeydown = null;
		});
	}

	async #passCards(sourceGroup) {
		const duration = 150;
		const your = this.#yourCardsEl.contains(sourceGroup);
		const destinationCardEl = your ? this.#opponentCardsEl : this.#yourCardsEl;
		const destinationGroup = this.#getGroup(sourceGroup.dataset.level, destinationCardEl);
		const sourceBox = (your ? sourceGroup : this.#opponentCardsEl).getBoundingClientRect();
		const destinationBox = (your ? this.#opponentCardsEl : destinationGroup).getBoundingClientRect();

		const dx = sourceBox.x - destinationBox.x;
		const dy = sourceBox.y - destinationBox.y;

		const cards = [...sourceGroup.querySelectorAll('.card')];

		if (your) {
			for (const card of cards) {
				card.style.transition = `all linear ${duration}ms`;
				card.style.left = `${-dx}px`;
				card.style.top = `${-dy}px`;
				await this.#wait(duration);
				this.#makeSwipeSound();
				destinationGroup.append(card.parentElement);
				await this.#wait(duration / 10);
				card.style.left = card.style.top = '';
			}
		} else {
			for (const card of cards) {
				card.parentElement.remove();
				card.style.transition = `all linear ${duration}ms`;
				card.style.left = `${dx}px`;
				card.style.top = `${dy}px`;
				destinationGroup.append(card.parentElement);
				await this.#wait(duration / 10);
				card.style.left = card.style.top = '';
				await this.#wait(duration);
				this.#makeSwipeSound();
			}
		}
	}
}